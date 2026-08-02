import { create } from "zustand";
import { nanoid } from "nanoid";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Worker, WorkerStatus, WorkItem } from "../lib/types";
import { workersRepo } from "../lib/repo";
import { now } from "../lib/db";
import { announce } from "./notifications";

/** Log lines kept per worker; older lines scroll out of memory. */
const LOG_CAP = 400;

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
 * The brief a worker starts from. It is deliberately explicit that the worker
 * must not push or open a PR — that gate belongs to the user, and the worker
 * has a real checkout with real credentials.
 */
function briefFor(item: WorkItem, repoLabel: string): string {
  const ref = item.kind === "issue" ? `issue #${item.number}` : `pull request #${item.number}`;
  const inspect =
    item.kind === "issue"
      ? `gh issue view ${item.number} --comments`
      : `gh pr view ${item.number} --comments` +
        ` (and \`gh pr diff ${item.number}\` for the current changes)`;

  return [
    `You are an autonomous worker on ${repoLabel || "this repository"}, working on ${ref}: "${item.title}".`,
    ``,
    `Start by reading the full context: \`${inspect}\`.`,
    `Then make the change in this worktree — it is yours alone, so edit freely.`,
    ``,
    `Rules:`,
    `- Work only inside this working directory.`,
    `- Commit your work locally with a clear message when you are done.`,
    `- Do not try to push or open a pull request. You cannot: those commands are`,
    `  blocked. A human reviews your diff and publishes it.`,
    `- If the task is ambiguous or you cannot complete it, stop and explain why`,
    `  rather than guessing at a large change.`,
  ].join("\n");
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

interface OrchState {
  workers: Worker[];
  /** Live log lines per worker id (in-memory only). */
  logs: Record<string, string[]>;
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
  setRepoPath: (path: string) => void;
  setModel: (model: string) => void;
  setAllowTests: (allow: boolean) => void;
  refreshQueue: () => Promise<void>;
  start: (item: WorkItem) => Promise<void>;
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

  async start(item) {
    const { repoPath, repoLabel, model, allowTests } = get();
    const id = nanoid();
    const branch = branchFor(item, id);
    const prompt = briefFor(item, repoLabel);
    const ts = now();

    const { worktree_path, base_sha } = await invoke<{
      worktree_path: string;
      base_sha: string;
    }>("orch_spawn", {
      id,
      repoPath,
      branch,
      // A PR worker branches from that PR's head so its changes are present.
      baseRef: item.kind === "pr" ? item.head_ref : "",
      prompt,
      model,
      permissionMode: "acceptEdits",
      allowTests,
    });

    const worker: Worker = {
      id,
      repo_path: repoPath,
      repo_label: repoLabel,
      source_kind: item.kind,
      source_number: item.number,
      title: item.title,
      prompt,
      branch,
      worktree_path,
      base_sha,
      status: "running",
      error: "",
      session_id: "",
      cost_usd: 0,
      pr_url: "",
      created_at: ts,
      updated_at: ts,
    };
    set((s) => ({
      workers: [worker, ...s.workers],
      logs: { ...s.logs, [id]: ["▸ worktree created, starting worker…"] },
    }));
    await workersRepo.create(worker);
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
      delete logs[worker.id];
      return { workers: s.workers.filter((w) => w.id !== worker.id), logs };
    });
    await workersRepo.remove(worker.id);
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

    return () => {
      offLog();
      offStatus();
    };
  },
}));
