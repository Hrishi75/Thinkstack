//! Worker orchestration.
//!
//! A *worker* is one non-interactive Claude Code session (`claude -p`) running
//! in its own git worktree, so several workers can edit the same repository at
//! once without ever touching each other's files. Work comes from GitHub issues
//! and PRs via the `gh` CLI.
//!
//! Autonomy stops at the worktree: a worker commits nothing to `origin`. When
//! it finishes, the worker lands in `review` and the user explicitly approves
//! before anything is pushed or a PR is opened.
//!
//! Every external program is invoked with an argument vector (never a shell
//! string), and all user-supplied values are validated against an allowlist
//! before use, so nothing here is shell-injectable.

use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const MAX_PROMPT_CHARS: usize = 20_000;
const MAX_DIFF_CHARS: usize = 400_000;

/// Programs we shell out to. Fixed set — never built from user input.
const BINS: [&str; 3] = ["git", "gh", "claude"];

/// Bash commands a worker may run. `acceptEdits` alone denies *all* Bash, which
/// would leave a worker unable to even read its issue, so we allow an explicit
/// set: inspect the repo, read the ticket, commit locally.
///
/// The omissions are the point. `git push`, `git remote`, and `gh pr create`
/// are absent, so "propose only, never publish" is enforced by the permission
/// layer rather than by asking the model nicely. Publishing happens in
/// `orch_approve`, from an explicit user click.
const WORKER_TOOLS: [&str; 10] = [
    "Bash(git status:*)",
    "Bash(git diff:*)",
    "Bash(git log:*)",
    "Bash(git show:*)",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git restore:*)",
    "Bash(gh issue view:*)",
    "Bash(gh pr view:*)",
    "Bash(gh pr diff:*)",
];

/// Opt-in build/test runners, so a worker can check its own work.
const TEST_TOOLS: [&str; 7] = [
    "Bash(npm:*)",
    "Bash(pnpm:*)",
    "Bash(yarn:*)",
    "Bash(cargo:*)",
    "Bash(make:*)",
    "Bash(pytest:*)",
    "Bash(go:*)",
];

#[derive(Default, Clone)]
pub struct Orchestrator {
    /// Live child processes, keyed by worker id.
    running: Arc<Mutex<HashMap<String, Child>>>,
    /// Workers the user stopped, so the reader reports `stopped`, not `failed`.
    stopping: Arc<Mutex<HashSet<String>>>,
    /// Resolved absolute paths for `BINS`.
    bins: Arc<Mutex<HashMap<String, String>>>,
}

/* ---------------------------- validation ---------------------------- */

/// Worker ids are client-generated nanoids; keep them filesystem-safe since
/// they name a worktree directory.
fn validate_id(id: &str) -> Result<(), String> {
    let ok = id.len() >= 8
        && id.len() <= 32
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err("invalid worker id".into())
    }
}

/// Refuse anything git would reject or that could be read as an option.
fn validate_branch(branch: &str) -> Result<(), String> {
    let ok = !branch.is_empty()
        && branch.len() <= 100
        && !branch.starts_with('-')
        && !branch.starts_with('/')
        && !branch.contains("..")
        && branch
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '/' | '-'));
    if ok {
        Ok(())
    } else {
        Err("invalid branch name".into())
    }
}

/// Claude Code permission modes a worker may run under. `bypassPermissions` is
/// deliberately absent: a worker runs unattended, and the worktree is a real
/// checkout on the user's disk, not a sandbox.
fn validate_permission_mode(mode: &str) -> Result<(), String> {
    match mode {
        "acceptEdits" | "plan" | "dontAsk" => Ok(()),
        _ => Err("unsupported permission mode".into()),
    }
}

/// Resolve a path the user pointed at and confirm it really is a git repo.
fn validate_repo(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("repository path must be absolute".into());
    }
    let canonical = p
        .canonicalize()
        .map_err(|_| format!("no such folder: {path}"))?;
    if !canonical.join(".git").exists() {
        return Err(format!(
            "{} is not a git repository",
            canonical.display()
        ));
    }
    Ok(canonical)
}

/// Worktrees live in app data, never inside the user's repo.
fn worktree_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("worktrees");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/* ------------------------------ helpers ------------------------------ */

impl Orchestrator {
    /// Absolute path for one of `BINS`, cached after first lookup.
    ///
    /// A GUI app launched from Finder does not inherit the user's shell PATH,
    /// so `gh` (Homebrew) and `claude` (~/.local/bin) are usually invisible to
    /// a plain lookup. Fall back to a login shell, which does load their PATH.
    async fn bin(&self, name: &str) -> Result<String, String> {
        if !BINS.contains(&name) {
            return Err("unknown program".into());
        }
        if let Some(found) = self.bins.lock().await.get(name) {
            return Ok(found.clone());
        }

        let mut found = which(name).await;
        if found.is_none() {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            if let Ok(out) = Command::new(shell)
                .arg("-lc")
                .arg(format!("command -v {name}"))
                .output()
                .await
            {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if out.status.success() && !path.is_empty() {
                    found = Some(path);
                }
            }
        }

        let path = found.ok_or_else(|| {
            format!("`{name}` isn't installed, or isn't on this app's PATH.")
        })?;
        self.bins.lock().await.insert(name.into(), path.clone());
        Ok(path)
    }
}

async fn which(name: &str) -> Option<String> {
    let out = Command::new("which").arg(name).output().await.ok()?;
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !path.is_empty()).then_some(path)
}

/// Run a program to completion, returning stdout or the program's own stderr.
async fn run(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = cmd
        .output()
        .await
        .map_err(|e| format!("couldn't run {program}: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let msg = if err.is_empty() {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        } else {
            err
        };
        return Err(if msg.is_empty() {
            format!("{program} failed")
        } else {
            msg
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/* ------------------------------- events ------------------------------- */

#[derive(Serialize, Clone)]
struct LogEvent {
    id: String,
    line: String,
}

#[derive(Serialize, Clone)]
struct StatusEvent {
    id: String,
    status: String,
    error: String,
    session_id: String,
    cost_usd: f64,
}

fn log(app: &AppHandle, id: &str, line: impl Into<String>) {
    let _ = app.emit(
        "orch://log",
        LogEvent {
            id: id.into(),
            line: line.into(),
        },
    );
}

/// Turn one Claude Code stream-json event into a readable log line.
/// Returns `None` for events that would only add noise.
fn summarize(v: &Value) -> Option<String> {
    match v["type"].as_str()? {
        "system" if v["subtype"] == "init" => Some(format!(
            "▸ session started · model {}",
            v["model"].as_str().unwrap_or("?")
        )),
        "assistant" => {
            let blocks = v["message"]["content"].as_array()?;
            let mut out = Vec::new();
            for b in blocks {
                match b["type"].as_str() {
                    Some("text") => {
                        let t = b["text"].as_str().unwrap_or("").trim();
                        if !t.is_empty() {
                            out.push(t.to_string());
                        }
                    }
                    Some("tool_use") => {
                        let name = b["name"].as_str().unwrap_or("tool");
                        // Show the most identifying input field, briefly.
                        let detail = b["input"]["file_path"]
                            .as_str()
                            .or_else(|| b["input"]["command"].as_str())
                            .or_else(|| b["input"]["pattern"].as_str())
                            .unwrap_or("");
                        out.push(if detail.is_empty() {
                            format!("⚙ {name}")
                        } else {
                            format!("⚙ {name} · {}", truncate(detail, 120))
                        });
                    }
                    _ => {}
                }
            }
            (!out.is_empty()).then(|| out.join("\n"))
        }
        "result" => {
            let secs = v["duration_ms"].as_f64().unwrap_or(0.0) / 1000.0;
            let cost = v["total_cost_usd"].as_f64().unwrap_or(0.0);
            let turns = v["num_turns"].as_u64().unwrap_or(0);
            Some(if v["is_error"].as_bool().unwrap_or(false) {
                format!("✖ {}", v["result"].as_str().unwrap_or("worker failed"))
            } else {
                format!("✔ finished · {turns} turns · {secs:.0}s · ${cost:.2}")
            })
        }
        _ => None,
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max).collect::<String>())
    }
}

/* ------------------------------ commands ------------------------------ */

#[derive(Serialize)]
pub struct EnvStatus {
    git: bool,
    gh: bool,
    claude: bool,
    gh_authenticated: bool,
}

/// What's available on this machine, so the UI can explain what's missing.
#[tauri::command]
pub async fn orch_check_env(state: tauri::State<'_, Orchestrator>) -> Result<EnvStatus, String> {
    let git = state.bin("git").await.is_ok();
    let gh = state.bin("gh").await.is_ok();
    let claude = state.bin("claude").await.is_ok();
    let gh_authenticated = match state.bin("gh").await {
        Ok(bin) => run(&bin, &["auth", "status"], None).await.is_ok(),
        Err(_) => false,
    };
    Ok(EnvStatus {
        git,
        gh,
        claude,
        gh_authenticated,
    })
}

#[derive(Serialize)]
pub struct WorkItem {
    kind: String,
    number: i64,
    title: String,
    labels: Vec<String>,
    updated_at: String,
    url: String,
    /// Source branch of a PR; empty for issues.
    head_ref: String,
}

/// `nameWithOwner` for the repo, e.g. "Hrishi75/Thinkstack".
#[tauri::command]
pub async fn orch_repo_label(
    state: tauri::State<'_, Orchestrator>,
    repo_path: String,
) -> Result<String, String> {
    let repo = validate_repo(&repo_path)?;
    let gh = state.bin("gh").await?;
    let out = run(
        &gh,
        &["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        Some(&repo),
    )
    .await?;
    Ok(out.trim().to_string())
}

/// Open issues and PRs, newest activity first.
#[tauri::command]
pub async fn orch_list_work(
    state: tauri::State<'_, Orchestrator>,
    repo_path: String,
) -> Result<Vec<WorkItem>, String> {
    let repo = validate_repo(&repo_path)?;
    let gh = state.bin("gh").await?;
    let fields = "number,title,labels,updatedAt,url";

    let mut items = Vec::new();
    for (kind, subcommand) in [("issue", "issue"), ("pr", "pr")] {
        // headRefName exists on PRs only; a worker for a PR branches from it.
        let pr_fields = format!("{fields},headRefName");
        let raw = run(
            &gh,
            &[
                subcommand,
                "list",
                "--state",
                "open",
                "--limit",
                "50",
                "--json",
                if kind == "pr" { &pr_fields } else { fields },
            ],
            Some(&repo),
        )
        .await?;
        let parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        for entry in parsed.as_array().cloned().unwrap_or_default() {
            items.push(WorkItem {
                kind: kind.to_string(),
                number: entry["number"].as_i64().unwrap_or(0),
                title: entry["title"].as_str().unwrap_or("").to_string(),
                labels: entry["labels"]
                    .as_array()
                    .map(|ls| {
                        ls.iter()
                            .filter_map(|l| l["name"].as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default(),
                updated_at: entry["updatedAt"].as_str().unwrap_or("").to_string(),
                url: entry["url"].as_str().unwrap_or("").to_string(),
                head_ref: entry["headRefName"].as_str().unwrap_or("").to_string(),
            });
        }
    }
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(items)
}

#[derive(Serialize)]
pub struct SpawnResult {
    worktree_path: String,
    base_sha: String,
}

/// Create the worktree and start a Claude Code session inside it.
///
/// Returns as soon as the process is running; progress arrives as `orch://log`
/// events and a final `orch://status`.
#[tauri::command]
pub async fn orch_spawn(
    app: AppHandle,
    state: tauri::State<'_, Orchestrator>,
    id: String,
    repo_path: String,
    branch: String,
    // Ref to branch from — a PR's head branch. Empty means the repo's HEAD.
    base_ref: String,
    prompt: String,
    model: String,
    permission_mode: String,
    // Whether the worker may run build/test commands as well as inspect + commit.
    allow_tests: bool,
) -> Result<SpawnResult, String> {
    validate_id(&id)?;
    validate_branch(&branch)?;
    if !base_ref.is_empty() {
        validate_branch(&base_ref)?;
    }
    validate_permission_mode(&permission_mode)?;
    if prompt.trim().is_empty() || prompt.len() > MAX_PROMPT_CHARS {
        return Err("prompt is empty or too long".into());
    }
    if model.len() > 64 || !model.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid model name".into());
    }
    let repo = validate_repo(&repo_path)?;

    let git = state.bin("git").await?;
    let claude = state.bin("claude").await?;

    // A PR worker must start from that PR's code, not from local HEAD.
    let base_sha = if base_ref.is_empty() {
        run(&git, &["rev-parse", "HEAD"], Some(&repo)).await?
    } else {
        run(&git, &["fetch", "origin", &base_ref], Some(&repo))
            .await
            .map_err(|e| format!("couldn't fetch {base_ref}: {e}"))?;
        run(&git, &["rev-parse", "FETCH_HEAD"], Some(&repo)).await?
    }
    .trim()
    .to_string();

    let worktree = worktree_root(&app)?.join(&id);
    let worktree_str = worktree.to_string_lossy().to_string();
    run(
        &git,
        &["worktree", "add", "-b", &branch, &worktree_str, &base_sha],
        Some(&repo),
    )
    .await
    .map_err(|e| format!("couldn't create worktree: {e}"))?;

    let mut args = vec![
        "-p".to_string(),
        prompt,
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--permission-mode".into(),
        permission_mode,
    ];
    if !model.is_empty() {
        args.push("--model".into());
        args.push(model);
    }
    // Variadic, so it goes last — everything after would be swallowed as a tool.
    args.push("--allowedTools".into());
    args.extend(WORKER_TOOLS.iter().map(|t| t.to_string()));
    if allow_tests {
        args.extend(TEST_TOOLS.iter().map(|t| t.to_string()));
    }

    let mut child = Command::new(&claude)
        .args(&args)
        .current_dir(&worktree)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("couldn't start claude: {e}"))?;

    let stdout = child.stdout.take().ok_or("no stdout from claude")?;
    let stderr = child.stderr.take().ok_or("no stderr from claude")?;
    state.running.lock().await.insert(id.clone(), child);

    // Stderr is diagnostics only; surface it but don't let it decide status.
    {
        let app = app.clone();
        let id = id.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    log(&app, &id, format!("stderr: {}", truncate(&line, 400)));
                }
            }
        });
    }

    // Stdout drives the whole lifecycle: parse events, then reap and report.
    {
        let app = app.clone();
        let orch = (*state).clone();
        let id = id.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            let mut session_id = String::new();
            let mut cost = 0.0;
            let mut reported_error: Option<String> = None;

            while let Ok(Some(line)) = lines.next_line().await {
                match serde_json::from_str::<Value>(&line) {
                    Ok(event) => {
                        if session_id.is_empty() {
                            if let Some(sid) = event["session_id"].as_str() {
                                session_id = sid.to_string();
                            }
                        }
                        if event["type"] == "result" {
                            cost = event["total_cost_usd"].as_f64().unwrap_or(0.0);
                            if event["is_error"].as_bool().unwrap_or(false) {
                                reported_error = Some(
                                    event["result"]
                                        .as_str()
                                        .unwrap_or("worker reported an error")
                                        .to_string(),
                                );
                            }
                        }
                        if let Some(msg) = summarize(&event) {
                            log(&app, &id, msg);
                        }
                    }
                    // Non-JSON output still belongs in the log.
                    Err(_) if !line.trim().is_empty() => {
                        log(&app, &id, truncate(&line, 400))
                    }
                    Err(_) => {}
                }
            }

            let exit_ok = match orch.running.lock().await.remove(&id) {
                Some(mut child) => child.wait().await.map(|s| s.success()).unwrap_or(false),
                None => false,
            };
            let was_stopped = orch.stopping.lock().await.remove(&id);

            let (status, error) = if was_stopped {
                ("stopped", String::new())
            } else if let Some(err) = reported_error {
                ("failed", err)
            } else if !exit_ok {
                ("failed", "claude exited unexpectedly".to_string())
            } else {
                ("review", String::new())
            };

            let _ = app.emit(
                "orch://status",
                StatusEvent {
                    id: id.clone(),
                    status: status.into(),
                    error,
                    session_id,
                    cost_usd: cost,
                },
            );
        });
    }

    Ok(SpawnResult {
        worktree_path: worktree_str,
        base_sha,
    })
}

/// Ask a running worker to stop. The reader task reports the final status.
#[tauri::command]
pub async fn orch_stop(state: tauri::State<'_, Orchestrator>, id: String) -> Result<(), String> {
    validate_id(&id)?;
    state.stopping.lock().await.insert(id.clone());
    match state.running.lock().await.get_mut(&id) {
        Some(child) => child.start_kill().map_err(|e| e.to_string()),
        None => {
            state.stopping.lock().await.remove(&id);
            Err("that worker isn't running".into())
        }
    }
}

/// Everything the worker changed since it branched — committed or not.
#[tauri::command]
pub async fn orch_diff(
    state: tauri::State<'_, Orchestrator>,
    worktree_path: String,
    base_sha: String,
) -> Result<String, String> {
    if !base_sha.chars().all(|c| c.is_ascii_hexdigit()) || base_sha.is_empty() {
        return Err("invalid base commit".into());
    }
    let worktree = Path::new(&worktree_path);
    if !worktree.is_absolute() || !worktree.exists() {
        return Err("this worker's worktree is gone".into());
    }
    let git = state.bin("git").await?;
    // Intent-to-add so brand-new files show up in the diff too.
    let _ = run(&git, &["add", "-A", "-N"], Some(worktree)).await;
    let diff = run(&git, &["diff", &base_sha], Some(worktree)).await?;
    Ok(truncate(&diff, MAX_DIFF_CHARS))
}

#[derive(Serialize)]
pub struct ApproveResult {
    pushed: bool,
    pr_url: String,
}

/// The one place anything leaves the machine: commit, push the branch, and
/// optionally open a PR. Only ever called from an explicit user action.
#[tauri::command]
pub async fn orch_approve(
    state: tauri::State<'_, Orchestrator>,
    repo_path: String,
    worktree_path: String,
    branch: String,
    title: String,
    body: String,
    open_pr: bool,
) -> Result<ApproveResult, String> {
    validate_branch(&branch)?;
    let repo = validate_repo(&repo_path)?;
    let worktree = Path::new(&worktree_path);
    if !worktree.is_absolute() || !worktree.exists() {
        return Err("this worker's worktree is gone".into());
    }
    if title.trim().is_empty() || title.len() > 300 {
        return Err("commit title is empty or too long".into());
    }
    let git = state.bin("git").await?;

    // Commit whatever the worker left uncommitted.
    let dirty = run(&git, &["status", "--porcelain"], Some(worktree)).await?;
    if !dirty.trim().is_empty() {
        run(&git, &["add", "-A"], Some(worktree)).await?;
        run(&git, &["commit", "-m", &title], Some(worktree)).await?;
    }

    let ahead = run(
        &git,
        &["rev-list", "--count", &format!("{branch}@{{u}}..{branch}")],
        Some(worktree),
    )
    .await
    .unwrap_or_else(|_| "1".into());
    if ahead.trim() == "0" {
        return Err("nothing to push — this worker made no changes".into());
    }

    run(&git, &["push", "-u", "origin", &branch], Some(worktree))
        .await
        .map_err(|e| format!("push failed: {e}"))?;

    let mut pr_url = String::new();
    if open_pr {
        let gh = state.bin("gh").await?;
        let body = if body.trim().is_empty() { " " } else { &body };
        pr_url = run(
            &gh,
            &[
                "pr", "create", "--head", &branch, "--title", &title, "--body", body,
            ],
            Some(&repo),
        )
        .await
        .map_err(|e| format!("branch pushed, but opening the PR failed: {e}"))?
        .trim()
        .to_string();
    }

    Ok(ApproveResult {
        pushed: true,
        pr_url,
    })
}

/// Throw the worker's work away: remove the worktree and delete its branch.
#[tauri::command]
pub async fn orch_discard(
    state: tauri::State<'_, Orchestrator>,
    repo_path: String,
    worktree_path: String,
    branch: String,
) -> Result<(), String> {
    validate_branch(&branch)?;
    let repo = validate_repo(&repo_path)?;
    let git = state.bin("git").await?;

    if Path::new(&worktree_path).exists() {
        run(
            &git,
            &["worktree", "remove", "--force", &worktree_path],
            Some(&repo),
        )
        .await?;
    }
    // Best-effort: the branch may already be gone, or never created.
    let _ = run(&git, &["worktree", "prune"], Some(&repo)).await;
    let _ = run(&git, &["branch", "-D", &branch], Some(&repo)).await;
    Ok(())
}
