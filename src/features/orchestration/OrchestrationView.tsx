import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Boxes,
  RefreshCw,
  Loader2,
  Square,
  GitPullRequest,
  CircleDot,
  FileDiff,
  Check,
  Trash2,
  X,
  ExternalLink,
  TriangleAlert,
  Play,
} from "lucide-react";
import { useOrchestrator, WORKER_MODELS } from "../../store/orchestrator";
import { announce } from "../../store/notifications";
import {
  WORKER_STATUS_STYLES,
  type Worker,
  type WorkItem,
} from "../../lib/types";
import { cn, relativeTime } from "../../lib/util";
import { Button } from "../../components/ui";

/** Colorize a unified diff so review is readable at a glance. */
function Diff({ text }: { text: string }) {
  return (
    <pre className="overflow-auto whitespace-pre px-4 py-3 font-mono text-[11.5px] leading-[1.55]">
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            line.startsWith("+++") || line.startsWith("---")
              ? "text-muted"
              : line.startsWith("+")
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : line.startsWith("-")
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : line.startsWith("@@")
                    ? "text-accent"
                    : "text-muted"
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function DiffModal({
  worker,
  text,
  onClose,
}: {
  worker: Worker;
  text: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[8vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={onClose}
    >
      <motion.div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
        initial={{ scale: 0.98, y: -8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: -8 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{worker.title}</h2>
            <p className="truncate font-mono text-[11px] text-muted">{worker.branch}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {text.trim() ? (
            <Diff text={text} />
          ) : (
            <p className="px-4 py-10 text-center text-[13px] text-muted">
              This worker didn't change any files.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function WorkerCard({ worker }: { worker: Worker }) {
  const logs = useOrchestrator((s) => s.logs[worker.id]);
  const stop = useOrchestrator((s) => s.stop);
  const diff = useOrchestrator((s) => s.diff);
  const approve = useOrchestrator((s) => s.approve);
  const discard = useOrchestrator((s) => s.discard);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [diffText, setDiffText] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const style = WORKER_STATUS_STYLES[worker.status];
  const lines = logs ?? [];

  // Follow the tail while the worker is live.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };

  const openDiff = () =>
    guard("diff", async () => setDiffText(await diff(worker)));

  const doApprove = (openPr: boolean) =>
    guard("approve", async () => {
      const url = await approve(worker, openPr);
      void announce({
        kind: "worker_done",
        title: url ? "Pushed and opened a pull request" : "Branch pushed to origin",
        body: [worker.title, url].filter(Boolean).join(" — "),
        link: { kind: "worker", id: worker.id },
        toast: url ? { label: "Open PR", run: () => void openUrl(url) } : true,
      });
    });

  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft">
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span
          className={cn(
            "mt-1 h-2 w-2 shrink-0 rounded-full",
            style.dot,
            worker.status === "running" && "animate-pulse"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium">{worker.title}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
                style.pill
              )}
            >
              {style.label}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            {worker.source_number !== null && (
              <span className="flex items-center gap-1">
                {worker.source_kind === "issue" ? (
                  <CircleDot size={11} />
                ) : (
                  <GitPullRequest size={11} />
                )}
                #{worker.source_number}
              </span>
            )}
            <span className="font-mono">{worker.branch}</span>
            <span>· {relativeTime(worker.created_at)}</span>
            {worker.cost_usd > 0 && <span>· ${worker.cost_usd.toFixed(2)}</span>}
          </div>
        </div>
      </div>

      {lines.length > 0 && (
        <div
          ref={logRef}
          className="mx-3.5 max-h-40 overflow-y-auto rounded-lg bg-elevated/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted"
        >
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))}
        </div>
      )}

      {(worker.error || error) && (
        <p className="mx-3.5 mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[11.5px] text-red-500">
          {error || worker.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 px-3 py-2.5">
        {worker.status === "running" ? (
          <button
            onClick={() => guard("stop", () => stop(worker.id))}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-elevated hover:text-red-500"
          >
            <Square size={12} /> Stop
          </button>
        ) : (
          <>
            <button
              onClick={openDiff}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-elevated hover:text-text disabled:opacity-40"
            >
              {busy === "diff" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileDiff size={12} />
              )}
              View diff
            </button>

            {worker.status === "review" && (
              <>
                <button
                  onClick={() => doApprove(true)}
                  disabled={!!busy}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {busy === "approve" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  Approve & open PR
                </button>
                <button
                  onClick={() => doApprove(false)}
                  disabled={!!busy}
                  className="rounded-md px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-elevated hover:text-text disabled:opacity-40"
                >
                  Push branch only
                </button>
              </>
            )}
          </>
        )}

        {worker.pr_url && (
          <button
            onClick={() => void openUrl(worker.pr_url)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-accent transition hover:bg-elevated"
          >
            <ExternalLink size={12} /> View PR
          </button>
        )}

        <span className="flex-1" />

        {worker.status !== "running" &&
          (confirmDiscard ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => guard("discard", () => discard(worker))}
                className="rounded-md bg-red-500/10 px-2 py-1.5 text-[11.5px] font-medium text-red-500 transition hover:bg-red-500/20"
              >
                Delete worktree & branch
              </button>
              <button
                onClick={() => setConfirmDiscard(false)}
                className="rounded-md px-1.5 py-1.5 text-[11.5px] text-muted transition hover:text-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDiscard(true)}
              className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-red-500"
              title="Discard worker"
            >
              <Trash2 size={13} />
            </button>
          ))}
      </div>

      <AnimatePresence>
        {diffText !== null && (
          <DiffModal
            worker={worker}
            text={diffText}
            onClose={() => setDiffText(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function QueueRow({ item, busy }: { item: WorkItem; busy: boolean }) {
  const start = useOrchestrator((s) => s.start);
  const [starting, setStarting] = useState(false);

  const run = async () => {
    setStarting(true);
    try {
      await start(item);
    } catch (e) {
      // Spawning touches git, gh and the filesystem; the reason it failed is
      // worth keeping around rather than vanishing with the toast.
      void announce({
        kind: "error",
        title: `Couldn't start a worker on #${item.number}`,
        body: String(e),
        toast: true,
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-elevated/60">
      {item.kind === "issue" ? (
        <CircleDot size={14} className="shrink-0 text-green-500" />
      ) : (
        <GitPullRequest size={14} className="shrink-0 text-purple-500" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{item.title}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          #{item.number}
          {item.labels.slice(0, 3).map((l) => (
            <span key={l} className="rounded bg-elevated px-1 py-px text-[10px]">
              {l}
            </span>
          ))}
        </div>
      </div>
      {busy ? (
        <span className="shrink-0 text-[11px] text-muted">worker active</span>
      ) : (
        <button
          onClick={run}
          disabled={starting}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted transition hover:border-accent/50 hover:text-text disabled:opacity-40"
        >
          {starting ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Play size={11} />
          )}
          Start worker
        </button>
      )}
    </div>
  );
}

export default function OrchestrationView() {
  const workers = useOrchestrator((s) => s.workers);
  const queue = useOrchestrator((s) => s.queue);
  const repoPath = useOrchestrator((s) => s.repoPath);
  const repoLabel = useOrchestrator((s) => s.repoLabel);
  const setRepoPath = useOrchestrator((s) => s.setRepoPath);
  const model = useOrchestrator((s) => s.model);
  const setModel = useOrchestrator((s) => s.setModel);
  const refreshQueue = useOrchestrator((s) => s.refreshQueue);
  const queueLoading = useOrchestrator((s) => s.queueLoading);
  const queueError = useOrchestrator((s) => s.queueError);
  const env = useOrchestrator((s) => s.env);
  const allowTests = useOrchestrator((s) => s.allowTests);
  const setAllowTests = useOrchestrator((s) => s.setAllowTests);

  const [pathDraft, setPathDraft] = useState(repoPath);

  const running = workers.filter((w) => w.status === "running").length;
  const review = workers.filter((w) => w.status === "review").length;

  // An item already has a worker if one is live or waiting on review.
  const claimed = useMemo(
    () =>
      new Set(
        workers
          .filter((w) => w.status === "running" || w.status === "review")
          .map((w) => `${w.source_kind}-${w.source_number}`)
      ),
    [workers]
  );

  const missing = env
    ? [
        !env.claude && "the `claude` CLI",
        !env.gh && "the `gh` CLI",
        env.gh && !env.gh_authenticated && "`gh auth login`",
      ].filter(Boolean)
    : [];

  const applyPath = () => setRepoPath(pathDraft.trim());

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center px-6" />
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col overflow-hidden px-6">
        <div className="flex items-start justify-between pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Orchestration</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Run parallel Claude Code workers on GitHub issues and PRs — each in
              its own git worktree. Nothing is pushed until you approve it.
            </p>
          </div>
          <div className="no-drag mt-0.5 flex shrink-0 items-center gap-2 text-[12px] text-muted">
            {running > 0 && <span>{running} running</span>}
            {review > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {review} to review
              </span>
            )}
          </div>
        </div>

        {missing.length > 0 && (
          <div className="no-drag mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
            <TriangleAlert size={14} className="mt-px shrink-0" />
            <span>
              Missing {missing.join(" and ")}. Workers can't start until that's
              available to the app.
            </span>
          </div>
        )}

        <div className="no-drag mb-3 flex items-center gap-2">
          <input
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyPath()}
            onBlur={applyPath}
            placeholder="/absolute/path/to/your/repo"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-[12px] outline-none transition focus:border-accent/60"
          />
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="shrink-0 rounded-lg bg-elevated/60 px-2 py-1.5 text-[12px] outline-none"
          >
            {WORKER_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="lg"
            onClick={refreshQueue}
            disabled={!repoPath || queueLoading}
          >
            {queueLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Load work
          </Button>
        </div>

        <div className="no-drag mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
          {repoLabel && (
            <span>
              Connected to <span className="text-text">{repoLabel}</span>
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={allowTests}
              onChange={(e) => setAllowTests(e.target.checked)}
              className="accent-accent"
            />
            Let workers run build & test commands
          </label>
          <span className="text-muted/70">
            Workers can never push or open PRs — that's blocked, not just asked.
          </span>
        </div>
        {queueError && (
          <p className="mb-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[12px] text-red-500">
            {queueError}
          </p>
        )}

        <div className="no-drag flex-1 overflow-y-auto pb-6">
          {workers.length === 0 && queue.length === 0 && !queueError && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Boxes size={30} className="text-accent" />
              <p className="mt-3 text-[15px] font-medium">No workers yet</p>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
                Point at a git repository above and load its open issues and pull
                requests. Start a worker on each one you want handled — they run at
                the same time, in separate worktrees, and land in review when done.
              </p>
            </div>
          )}

          {workers.length > 0 && (
            <>
              <div className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted/70">
                Workers
              </div>
              <div className="mb-4 flex flex-col gap-2">
                {workers.map((w) => (
                  <WorkerCard key={w.id} worker={w} />
                ))}
              </div>
            </>
          )}

          {queue.length > 0 && (
            <>
              <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted/70">
                Open work · {queue.length}
              </div>
              <div className="flex flex-col">
                {queue.map((item) => (
                  <QueueRow
                    key={`${item.kind}-${item.number}`}
                    item={item}
                    busy={claimed.has(`${item.kind}-${item.number}`)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
