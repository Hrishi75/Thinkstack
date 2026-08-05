import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  KeyRound,
  Check,
  Loader2,
  FileText,
  Braces,
  DatabaseBackup,
  Upload,
} from "lucide-react";
import { useAi, PROVIDERS, DEFAULT_MODELS } from "../store/ai";
import { announce } from "../store/notifications";
import {
  backupDatabase,
  exportNotesMarkdown,
  exportWorkspaceJson,
  type ExportResult,
} from "../lib/export";
import { applyImport, planImport, type ImportPlan } from "../lib/import";
import { useNotes } from "../store/notes";
import { useTasks } from "../store/tasks";
import { useSticky } from "../store/sticky";
import { useMemory } from "../store/memory";
import { useCalendar } from "../store/calendar";
import { useBoard } from "../store/board";
import { cn } from "../lib/util";

/** The three ways out, in the order most people want them. */
const EXPORTS = [
  {
    key: "markdown",
    icon: FileText,
    label: "Export notes as Markdown",
    hint: "One .md file per note, in a folder you choose",
    run: exportNotesMarkdown,
  },
  {
    key: "json",
    icon: Braces,
    label: "Export everything as JSON",
    hint: "Notes, tasks, stickies, memories, calendar marks and board layout",
    run: exportWorkspaceJson,
  },
  {
    key: "backup",
    icon: DatabaseBackup,
    label: "Back up the database",
    hint: "A consistent copy of the SQLite file itself",
    run: backupDatabase,
  },
] as const;

export default function SettingsModal() {
  const open = useAi((s) => s.settingsOpen);
  const setOpen = useAi((s) => s.setSettingsOpen);
  const provider = useAi((s) => s.provider);
  const setProvider = useAi((s) => s.setProvider);
  const model = useAi((s) => s.model);
  const setModel = useAi((s) => s.setModel);
  const hasKey = useAi((s) => s.hasKey);
  const saveKey = useAi((s) => s.saveKey);
  const clearKey = useAi((s) => s.clearKey);

  const [keyDraft, setKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyExport, setBusyExport] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);

  const reloadNotes = useNotes((s) => s.load);
  const reloadTasks = useTasks((s) => s.load);
  const reloadSticky = useSticky((s) => s.load);
  const reloadMemory = useMemory((s) => s.load);
  const reloadCalendar = useCalendar((s) => s.load);
  const reloadBoard = useBoard((s) => s.load);

  useEffect(() => {
    if (open) {
      setKeyDraft("");
      setError(null);
      setExportError(null);
      setPlan(null);
    }
  }, [open, provider]);

  const runExport = async (
    key: string,
    fn: () => Promise<ExportResult | null>
  ) => {
    setBusyExport(key);
    setExportError(null);
    try {
      const result = await fn();
      // A cancelled dialog is not a failure — say nothing and leave it be.
      if (result) {
        void announce({
          kind: "system",
          title: result.summary,
          body: result.path,
          toast: true,
        });
      }
    } catch (e) {
      setExportError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusyExport("");
    }
  };

  const chooseImport = () =>
    runExport("import", async () => {
      const next = await planImport();
      // Hold the plan for confirmation — nothing is written by choosing a file.
      setPlan(next);
      return null;
    });

  const confirmImport = async () => {
    if (!plan) return;
    setBusyExport("import");
    setExportError(null);
    try {
      const { added, skipped } = await applyImport(plan);
      await Promise.all([
        reloadNotes(),
        reloadTasks(),
        reloadSticky(),
        reloadMemory(),
        reloadCalendar(),
        reloadBoard(),
      ]);
      setPlan(null);
      void announce({
        kind: "system",
        title: `${added} item${added === 1 ? "" : "s"} imported`,
        body: skipped ? `${skipped} already here were left alone` : "",
        toast: true,
      });
    } catch (e) {
      setExportError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusyExport("");
    }
  };

  /** "12 notes, 3 tasks" — only the kinds that actually have something. */
  const planParts = plan
    ? (
        [
          [plan.notes.length, "note"],
          [plan.tasks.length, "task"],
          [plan.stickies.length, "sticky"],
          [plan.memories.length, "memory"],
          [plan.dayMarks.length, "calendar mark"],
        ] as const
      )
        .filter(([n]) => n > 0)
        .map(([n, label]) =>
          label === "memory"
            ? `${n} ${n === 1 ? "memory" : "memories"}`
            : `${n} ${label}${n === 1 ? "" : "s"}`
        )
    : [];

  const providerLabel =
    PROVIDERS.find((p) => p.key === provider)?.label ?? provider;

  const save = async () => {
    if (!keyDraft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveKey(keyDraft);
      setKeyDraft("");
      void announce({
        kind: "system",
        title: "API key saved to your system keychain",
        body: providerLabel,
        toast: true,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await clearKey();
      void announce({
        kind: "system",
        title: "API key removed",
        body: providerLabel,
        toast: true,
      });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
            initial={{ scale: 0.98, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: -8 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-semibold">Settings</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 py-4">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted/70">
                AI Assistant
              </h3>

              {/* Provider */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Provider
                </label>
                <div className="flex gap-1 rounded-lg bg-elevated/60 p-1">
                  {PROVIDERS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setProvider(key)}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-[13px] transition",
                        provider === key
                          ? "bg-bg font-medium text-text shadow-soft"
                          : "text-muted hover:text-text"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Model
                </label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={DEFAULT_MODELS[provider]}
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none transition focus:border-accent/60"
                />
              </div>

              {/* API key */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <KeyRound size={12} /> API key
                  {hasKey && (
                    <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                      <Check size={10} /> saved
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && save()}
                    placeholder={
                      hasKey
                        ? "Enter a new key to replace the saved one"
                        : provider === "anthropic"
                          ? "sk-ant-…"
                          : provider === "groq"
                            ? "gsk_…"
                            : "sk-…"
                    }
                    className="flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none transition focus:border-accent/60"
                  />
                  <button
                    onClick={save}
                    disabled={!keyDraft.trim() || saving}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white shadow-soft transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                  </button>
                </div>
                {hasKey && (
                  <button
                    onClick={remove}
                    className="mt-1.5 text-[11.5px] text-muted underline decoration-dotted transition hover:text-red-500"
                  >
                    Remove saved key
                  </button>
                )}
                {error && (
                  <p className="mt-1.5 text-[12px] text-red-500">{error}</p>
                )}
              </div>

              <p className="rounded-lg bg-elevated/50 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                Your key is stored in the <strong>system keychain</strong> on this
                device and used only to call {providerLabel} directly — it never
                touches any other server. AI actions send the current note's text
                to {providerLabel}.
              </p>

              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted/70">
                  Your data
                </h3>

                <div className="flex flex-col gap-1">
                  {EXPORTS.map(({ key, icon: Icon, label, hint, run }) => (
                    <button
                      key={key}
                      onClick={() => runExport(key, run)}
                      disabled={!!busyExport}
                      className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-elevated/70 disabled:opacity-40"
                    >
                      {busyExport === key ? (
                        <Loader2
                          size={14}
                          className="mt-px shrink-0 animate-spin text-accent"
                        />
                      ) : (
                        <Icon size={14} className="mt-px shrink-0 text-muted" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-[13px]">{label}</span>
                        <span className="block text-[11.5px] leading-relaxed text-muted">
                          {hint}
                        </span>
                      </span>
                    </button>
                  ))}

                  <button
                    onClick={chooseImport}
                    disabled={!!busyExport}
                    className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-elevated/70 disabled:opacity-40"
                  >
                    {busyExport === "import" && !plan ? (
                      <Loader2
                        size={14}
                        className="mt-px shrink-0 animate-spin text-accent"
                      />
                    ) : (
                      <Upload size={14} className="mt-px shrink-0 text-muted" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-[13px]">Import from JSON</span>
                      <span className="block text-[11.5px] leading-relaxed text-muted">
                        Adds what you don't already have — nothing is overwritten
                      </span>
                    </span>
                  </button>
                </div>

                {plan && (
                  <div className="mt-2 rounded-lg border border-border bg-elevated/40 px-3 py-2.5">
                    {plan.total === 0 ? (
                      <p className="text-[12.5px]">
                        Nothing to import — everything in that file is already
                        here.
                      </p>
                    ) : (
                      <p className="text-[12.5px]">
                        Ready to add <strong>{planParts.join(", ")}</strong>.
                      </p>
                    )}
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                      {plan.skipped > 0 &&
                        `${plan.skipped} record${plan.skipped === 1 ? "" : "s"} already here will be left untouched. `}
                      {plan.invalid > 0 &&
                        `${plan.invalid} couldn't be read and will be skipped. `}
                      {plan.exportedAt &&
                        `Exported ${new Date(plan.exportedAt).toLocaleString()}.`}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      {plan.total > 0 && (
                        <button
                          onClick={confirmImport}
                          disabled={!!busyExport}
                          className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                        >
                          {busyExport === "import" ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Import
                        </button>
                      )}
                      <button
                        onClick={() => setPlan(null)}
                        className="rounded-md px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-elevated hover:text-text"
                      >
                        {plan.total > 0 ? "Cancel" : "Close"}
                      </button>
                    </div>
                  </div>
                )}

                {exportError && (
                  <p className="mt-1.5 rounded-lg bg-red-500/10 px-2.5 py-2 text-[12px] text-red-500">
                    {exportError}
                  </p>
                )}

                <p className="mt-2 rounded-lg bg-elevated/50 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                  Everything is written straight to the folder you pick. Nothing is
                  uploaded, and no copy is kept anywhere else.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
