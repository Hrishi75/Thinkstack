import { create } from "zustand";
import { nanoid } from "nanoid";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Worker, WorkerStatus, WorkItem } from "../lib/types";
import { workersRepo } from "../lib/repo";
import { now } from "../lib/db";
import { announce } from "./notifications";
import { buildMemoryContext, useMemory } from "./memory";

/** Log lines kept per worker; older lines scroll out of memory. */
const LOG_CAP = 400;

/** How often a live worker's changed-file set is re-read from git. */
const FILE_POLL_MS = 5_000;

/** Peers named in a brief. A worker needs the shape of what else is moving,
 *  not a full roster — and the prompt has a hard size limit. */
const MAX_PEERS_IN_BRIEF = 6;

const REPO_KEY = "thinkstack.orch.repo";
const MODEL_KEY = "thinkstack.orch.model";
const TESTS_KEY = "thinkstack.orch.allowTests";

export const WORKER_MODELS = ["opus", "sonnet", "haiku"] as const;

export interface EnvStatus {
  git: boolean;
  gh: boolean;
  claude: boolean;
  gh_authenticated: boolean;
}

interface LogEvent {
  id: string;
  line: string;
}

interface StatusEvent {
  id: string;
  status: WorkerStatus;
  error: string;
  session_id: string;
  cost_usd: number;
}

/**
 * One line per peer worker, with the files it has touched so far when we know
 * them. Isolation means a worker cannot *see* its peers' edits, so the only way
 * it can avoid trampling them is to be told they exist.
 */
function peerLines(peers: Worker[], changedFiles: Record<string, string[]>): string[] {
  return peers.slice(0, MAX_PEERS_IN_BRIEF).map((p) => {
    const ref =
      p.source_number === null
        ? p.branch
        : `${p.source_kind === "issue" ? "issue" : "PR"} #${p.source_number}`;
    const files = changedFiles[p.id] ?? [];
    const touching = files.length
      ? ` — so far editing ${files.slice(0, 6).join(", ")}${files.length > 6 ? `, +${files.length - 6} more` : ""}`
      : "";
    return `- ${ref}: "${p.title}"${touching}`;
  });
}

/**
 * The brief a worker starts from. It is deliberately explicit that the worker
 * must not push or open a PR — that gate belongs to the user, and the worker
 * has a real checkout with real credentials.
 *
 * Standing workspace memory is appended the same way it rides along on every
 * assistant request, so a worker starts knowing the things you'd otherwise have
 * to restate in every issue.
 */
function briefFor(
  worker: Worker,
  parent: Worker | undefined,
  peers: Worker[],
  changedFiles: Record<string, string[]>,
  memory: string
): string {
  const n = worker.source_number;
  const ref =
    n === null
      ? `"${worker.title}"`
      : `${worker.source_kind === "issue" ? "issue" : "pull request"} #${n}: "${worker.title}"`;
  const inspect =
    n === null
      ? ""
      : worker.source_kind === "issue"
        ? `gh issue view ${n} --comments`
        : `gh pr view ${n} --comments (and \`gh pr diff ${n}\` for the current changes)`;

  const lines = [
    `You are an autonomous worker on ${worker.repo_label || "this repository"}, working on ${ref}.`,
    ``,
    ...(inspect ? [`Start by reading the full context: \`${inspect}\`.`] : []),
    `Then make the change in this worktree — it is yours alone, so edit freely.`,
    ``,
    `Rules:`,
    `- Work only inside this working directory.`,
    `- Commit your work locally with a clear message when you are done.`,
    `- Do not try to push or open a pull request. You cannot: those commands are`,
    `  blocked. A human reviews your diff and publishes it.`,
    `- If the task is ambiguous or you cannot complete it, stop and explain why`,
    `  rather than guessing at a large change.`,
  ];

  if (peers.length) {
    lines.push(
      ``,
      `Other workers are running on this repository right now:`,
      ...peerLines(peers, changedFiles),
      ``,
      `You each have your own worktree, so you will not see their edits and they`,
      `will not see yours — every overlap becomes a merge conflict for the human`,
      `reviewing you both. Stay inside the files this task needs. If you genuinely`,
      `must change a file another worker is in, make the smallest edit that works`,
      `and call it out in your final message.`
    );
  }

  if (parent) {
    const from =
      parent.source_number === null
        ? `"${parent.title}"`
        : `#${parent.source_number} ("${parent.title}")`;
    lines.push(
      ``,
      `This worktree does not start from the main branch. It starts from the`,
      `finished, approved work of ${from}, on branch \`${parent.branch}\`, because`,
      `your task builds on it. Read \`git log\` and \`git diff\` against the main`,
      `branch first to see what you have inherited — treat it as done, and build`,
      `on it rather than redoing or reverting it.`
    );
  }

  const brief = lines.join("\n");
  return memory ? `${brief}\n\n---\n\n${memory}` : brief;
}

/** Branch name for a work item — validated Rust-side too. */
function branchFor(item: WorkItem, id: string): string {
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const kind = item.kind === "issue" ? "issue" : "pr";
  return `thinkstack/${kind}-${item.number}${slug ? `-${slug}` : ""}-${id.slice(0, 6)}`;
}

/** A file more than one still-open worker has changed. */
export interface Collision {
  path: string;
  workerIds: string[];
}

/** Workers whose changes are still in play — running, or waiting on review. */
function isOpen(w: Worker): boolean {
  return w.status === "running" || w.status === "review";
}

/**
 * Files two or more open workers have both changed. This reports collisions
 * rather than preventing them: the worktrees are already separate and the edits
 * already made, so the useful moment is *now*, while you can still redirect a
 * worker — not at merge time, when git finally notices.
 */
export function collisionsFrom(
  changedFiles: Record<string, string[]>,
  workers: Worker[]
): Collision[] {
  const open = new Set(workers.filter(isOpen).map((w) => w.id));
  const byPath = new Map<string, string[]>();

  for (const [id, paths] of Object.entries(changedFiles)) {
    if (!open.has(id)) continue;
    for (const path of paths) {
      const ids = byPath.get(path);
      if (ids) ids.push(id);
      else byPath.set(path, [id]);
    }
  }

  return [...byPath.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([path, workerIds]) => ({ path, workerIds }))
    .sort(
      (a, b) => b.workerIds.length - a.workerIds.length || a.path.localeCompare(b.path)
    );
}

interface OrchState {
  workers: Worker[];
  /** Live log lines per worker id (in-memory only). */
  logs: Record<string, string[]>;
  /** Files each open worker has changed, re-read from git while they run. */
  changedFiles: Record<string, string[]>;
  queue: WorkItem[];
  repoPath: string;
  repoLabel: string;
  model: string;
  /** Let workers run build/test commands, not just inspect and commit. */
  allowTests: boolean;
  env: EnvStatus | null;
  queueLoading: boolean;
  queueError: string;

  load: () => Promise<void>;
  checkEnv: () => Promise<void>;
  /** Re-read the changed-file set of every open worker. */
  refreshChangedFiles: () => Promise<void>;
  setRepoPath: (path: string) => void;
  setModel: (model: string) => void;
  setAllowTests: (allow: boolean) => void;
  refreshQueue: () => Promise<void>;
  /**
   * Begin work on an item. With `dependsOn` set, the worker starts from that
   * worker's branch — immediately if it's already approved, otherwise `queued`
   * until it is.
   */
  start: (item: WorkItem, dependsOn?: string) => Promise<void>;
  /** Create the worktree and process for a row that already exists. */
  spawn: (worker: Worker, baseRef: string, baseLocal: boolean) => Promise<void>;
  /**
   * Settle the queue against the current state of the workers it waits on:
   * start anything whose dependency is now approved, and fail anything whose
   * dependency can no longer be approved.
   */
  reconcileQueue: () => Promise<void>;
  stop: (id: string) => Promise<void>;
  diff: (worker: Worker) => Promise<string>;
  approve: (worker: Worker, openPr: boolean) => Promise<string>;
  discard: (worker: Worker) => Promise<void>;
  /** Subscribe to worker events. Returns an unsubscribe function. */
  subscribe: () => Promise<() => void>;
}

export const useOrchestrator = create<OrchState>((set, get) => ({
  workers: [],
  logs: {},
  changedFiles: {},
  queue: [],
  repoPath: localStorage.getItem(REPO_KEY) ?? "",
  repoLabel: "",
  model: localStorage.getItem(MODEL_KEY) ?? "sonnet",
  allowTests: localStorage.getItem(TESTS_KEY) === "1",
  env: null,
  queueLoading: false,
  queueError: "",

  async load() {
    // Worker processes don't survive an app restart, so clear stale 'running'.
    await workersRepo.reconcileOrphans();
    set({ workers: await workersRepo.list() });
    // Workers restored in `review` can still collide with each other — approve
    // one and the next won't merge — so seed the file sets before anything runs.
    await get().refreshChangedFiles();
    // A dependency approved just before the app closed leaves its dependents
    // sitting in `queued` with nothing left to wait for. Release them.
    await get().reconcileQueue();
  },

  async refreshChangedFiles() {
    const open = get().workers.filter(isOpen);
    const entries = await Promise.all(
      open.map(async (w) => {
        try {
          const paths = await invoke<string[]>("orch_changed_files", {
            worktreePath: w.worktree_path,
            baseSha: w.base_sha,
          });
          return [w.id, paths] as const;
        } catch {
          // A worktree can be missing or half-created; that's just nothing to
          // report, not a reason to lose everyone else's files.
          return [w.id, []] as const;
        }
      })
    );
    // Replacing the map (rather than merging) drops closed workers as they go.
    set({ changedFiles: Object.fromEntries(entries) });
  },

  async checkEnv() {
    try {
      set({ env: await invoke<EnvStatus>("orch_check_env") });
    } catch {
      set({ env: { git: false, gh: false, claude: false, gh_authenticated: false } });
    }
  },

  setRepoPath(repoPath) {
    localStorage.setItem(REPO_KEY, repoPath);
    set({ repoPath, queue: [], repoLabel: "", queueError: "" });
  },

  setModel(model) {
    localStorage.setItem(MODEL_KEY, model);
    set({ model });
  },

  setAllowTests(allowTests) {
    localStorage.setItem(TESTS_KEY, allowTests ? "1" : "0");
    set({ allowTests });
  },

  async refreshQueue() {
    const repoPath = get().repoPath.trim();
    if (!repoPath) return;
    set({ queueLoading: true, queueError: "" });
    try {
      const [queue, repoLabel] = await Promise.all([
        invoke<WorkItem[]>("orch_list_work", { repoPath }),
        invoke<string>("orch_repo_label", { repoPath }).catch(() => ""),
      ]);
      set({ queue, repoLabel, queueLoading: false });
    } catch (e) {
      set({ queueError: String(e), queueLoading: false, queue: [] });
    }
  },

  async start(item, dependsOn = "") {
    const { repoPath, repoLabel, workers } = get();
    const id = nanoid();
    const parent = dependsOn ? workers.find((w) => w.id === dependsOn) : undefined;
    // Only an approved parent has a complete branch to build on: until then its
    // last edits may still be uncommitted, so branching off it would lose them.
    const wait = !!parent && parent.status !== "approved";
    const ts = now();

    // The row is written before the process exists, so a worktree that fails to
    // create leaves a worker you can see and discard rather than nothing at all.
    const worker: Worker = {
      id,
      repo_path: repoPath,
      repo_label: repoLabel,
      source_kind: item.kind,
      source_number: item.number,
      title: item.title,
      prompt: "",
      branch: branchFor(item, id),
      worktree_path: "",
      base_sha: "",
      depends_on: dependsOn,
      status: wait ? "queued" : "running",
      error: "",
      session_id: "",
      cost_usd: 0,
      pr_url: "",
      created_at: ts,
      updated_at: ts,
    };
    set((s) => ({ workers: [worker, ...s.workers] }));
    await workersRepo.create(worker);

    if (wait) return;
    await get().spawn(
      worker,
      // A dependent starts from its parent's local branch; a PR worker from
      // that PR's head, so the changes it is meant to build on are present.
      parent ? parent.branch : item.kind === "pr" ? item.head_ref : "",
      !!parent
    );
  },

  async spawn(worker, baseRef, baseLocal) {
    const { model, allowTests, workers, changedFiles } = get();
    const parent = worker.depends_on
      ? workers.find((w) => w.id === worker.depends_on)
      : undefined;

    // Built here rather than at enqueue time so a worker that waited hours for
    // its dependency still opens with the peers and memory that are true now.
    await useMemory.getState().ensureLoaded();
    const memory = buildMemoryContext(useMemory.getState().memories);
    const peers = workers.filter((w) => w.status === "running" && w.id !== worker.id);
    const prompt = briefFor(worker, parent, peers, changedFiles, memory);

    set((s) => ({
      logs: { ...s.logs, [worker.id]: ["▸ worktree created, starting worker…"] },
    }));

    try {
      const { worktree_path, base_sha } = await invoke<{
        worktree_path: string;
        base_sha: string;
      }>("orch_spawn", {
        id: worker.id,
        repoPath: worker.repo_path,
        branch: worker.branch,
        baseRef,
        baseLocal,
        prompt,
        model,
        permissionMode: "acceptEdits",
        allowTests,
      });
      const patch = {
        prompt,
        worktree_path,
        base_sha,
        status: "running" as const,
        error: "",
      };
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === worker.id ? { ...w, ...patch, updated_at: now() } : w
        ),
      }));
      await workersRepo.update(worker.id, patch);
    } catch (e) {
      // Record the failure on the row before rethrowing: a promoted worker has
      // no user watching a button, so the card is the only place it can show.
      const patch = { status: "failed" as const, error: String(e) };
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === worker.id ? { ...w, ...patch, updated_at: now() } : w
        ),
      }));
      await workersRepo.update(worker.id, patch);
      throw e;
    }
  },

  async reconcileQueue() {
    const { workers } = get();
    const queued = workers.filter((w) => w.status === "queued");
    const parentOf = (w: Worker) => workers.find((p) => p.id === w.depends_on);

    // A parent that was discarded, stopped or failed will never be approved, so
    // its dependents are waiting on something that can no longer happen. Say so
    // on the card instead of leaving them to look pending forever.
    const stranded = queued.filter((w) => {
      if (!w.depends_on) return false;
      const parent = parentOf(w);
      return !parent || parent.status === "failed" || parent.status === "stopped";
    });
    if (stranded.length) {
      const patch = {
        status: "failed" as const,
        error: "The worker this one was waiting for is gone, so it can never start.",
      };
      const ids = new Set(stranded.map((w) => w.id));
      set((s) => ({
        workers: s.workers.map((w) =>
          ids.has(w.id) ? { ...w, ...patch, updated_at: now() } : w
        ),
      }));
      await Promise.all([...ids].map((id) => workersRepo.update(id, patch)));
    }

    const ready = queued.filter(
      (w) => !w.depends_on || parentOf(w)?.status === "approved"
    );

    // Sequential on purpose: `git worktree add` mutates the same repository, so
    // two promotions firing at once would race over its index.
    for (const w of ready) {
      const parent = workers.find((p) => p.id === w.depends_on);
      try {
        await get().spawn(w, parent ? parent.branch : "", !!parent);
        void announce({
          kind: "system",
          eventKey: `worker:${w.id}:promoted`,
          title: `Started: ${w.title || w.branch}`,
          body: parent ? `${parent.title} was approved, so this could begin.` : "",
          link: { kind: "worker", id: w.id },
        });
      } catch {
        // spawn() already recorded why on the row; one bad worktree shouldn't
        // stop the rest of the queue from starting.
      }
    }
  },

  async stop(id) {
    await invoke("orch_stop", { id });
  },

  async diff(worker) {
    return invoke<string>("orch_diff", {
      worktreePath: worker.worktree_path,
      baseSha: worker.base_sha,
    });
  },

  async approve(worker, openPr) {
    const body = worker.source_number
      ? `${worker.source_kind === "issue" ? "Closes" : "Follow-up to"} #${worker.source_number}\n\nPrepared by a Thinkstack worker; reviewed before publishing.`
      : "";
    const { pr_url } = await invoke<{ pushed: boolean; pr_url: string }>("orch_approve", {
      repoPath: worker.repo_path,
      worktreePath: worker.worktree_path,
      branch: worker.branch,
      title: worker.title || `Work from ${worker.branch}`,
      body,
      openPr,
    });
    set((s) => ({
      workers: s.workers.map((w) =>
        w.id === worker.id ? { ...w, status: "approved", pr_url, updated_at: now() } : w
      ),
    }));
    await workersRepo.update(worker.id, { status: "approved", pr_url });
    // Anything queued behind this one now has a complete branch to build on.
    await get().reconcileQueue();
    return pr_url;
  },

  async discard(worker) {
    await invoke("orch_discard", {
      repoPath: worker.repo_path,
      worktreePath: worker.worktree_path,
      branch: worker.branch,
    });
    set((s) => {
      const logs = { ...s.logs };
      const changedFiles = { ...s.changedFiles };
      delete logs[worker.id];
      delete changedFiles[worker.id];
      return {
        workers: s.workers.filter((w) => w.id !== worker.id),
        logs,
        changedFiles,
      };
    });
    await workersRepo.remove(worker.id);
    // Its branch is gone, so nothing can still be built on top of it.
    await get().reconcileQueue();
  },

  async subscribe() {
    const offLog = await listen<LogEvent>("orch://log", ({ payload }) => {
      set((s) => {
        const existing = s.logs[payload.id] ?? [];
        const next = [...existing, ...payload.line.split("\n")];
        return {
          logs: {
            ...s.logs,
            [payload.id]: next.slice(Math.max(0, next.length - LOG_CAP)),
          },
        };
      });
    });

    const offStatus = await listen<StatusEvent>("orch://status", ({ payload }) => {
      const { id, status, error, session_id, cost_usd } = payload;
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === id
            ? { ...w, status, error, session_id, cost_usd, updated_at: now() }
            : w
        ),
      }));
      // Fire-and-forget: the UI already reflects it.
      void workersRepo.update(id, { status, error, session_id, cost_usd });
      // The last edits a worker makes usually land after the final poll, so
      // capture its finished shape rather than waiting for the next tick.
      void get().refreshChangedFiles();
      // A worker that failed or was stopped will never be approved, so anything
      // queued behind it needs to hear about it now, not at the next launch.
      void get().reconcileQueue();

      // A worker finishes on its own schedule, usually while the user is in
      // another view or another app — so this is both a banner and an entry.
      if (status === "review" || status === "failed") {
        const worker = get().workers.find((w) => w.id === id);
        const label = worker?.title || worker?.branch || "Worker";
        void announce({
          kind: status === "review" ? "worker_review" : "worker_failed",
          eventKey: `worker:${id}:${status}`,
          title:
            status === "review"
              ? `Ready to review: ${label}`
              : `Worker failed: ${label}`,
          body: status === "review" ? worker?.repo_label ?? "" : error,
          link: { kind: "worker", id },
          desktop: true,
        });
      }
    });

    // Only poll while something is actually running: a `review` worker's files
    // are frozen, so an idle app makes no git calls at all.
    const timer = setInterval(() => {
      if (get().workers.some((w) => w.status === "running")) {
        void get().refreshChangedFiles();
      }
    }, FILE_POLL_MS);

    return () => {
      offLog();
      offStatus();
      clearInterval(timer);
    };
  },
}));
