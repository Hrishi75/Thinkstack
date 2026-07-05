import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { BlockNoteEditor } from "@blocknote/core";
import {
  Sparkles,
  Loader2,
  ArrowLeft,
  ClipboardCopy,
  CornerDownLeft,
  ListPlus,
  Settings2,
  FileText,
  Wand2,
  SpellCheck,
  PenLine,
  ListChecks,
} from "lucide-react";
import { useAi } from "../../store/ai";
import { useTasks } from "../../store/tasks";
import { useUI } from "../../store/ui";
import type { Note } from "../../lib/types";
import { cn } from "../../lib/util";

const CONTEXT_LIMIT = 16_000;

interface AiAction {
  id: string;
  label: string;
  icon: typeof Sparkles;
  instruction: string;
  /** Marks the result as a task list, enabling "Add as tasks". */
  tasks?: boolean;
}

const ACTIONS: AiAction[] = [
  {
    id: "summarize",
    label: "Summarize",
    icon: FileText,
    instruction:
      "Summarize the following note in a few short bullet points (plain lines starting with '- ').",
  },
  {
    id: "improve",
    label: "Improve writing",
    icon: Wand2,
    instruction:
      "Rewrite the following note text to be clearer and better written. Keep the meaning, tone, and language.",
  },
  {
    id: "grammar",
    label: "Fix spelling & grammar",
    icon: SpellCheck,
    instruction:
      "Fix the spelling and grammar in the following text. Return the corrected text only, preserving formatting.",
  },
  {
    id: "continue",
    label: "Continue writing",
    icon: PenLine,
    instruction:
      "Continue writing this note naturally in the same voice. Return only the continuation.",
  },
  {
    id: "tasks",
    label: "Extract tasks",
    icon: ListChecks,
    instruction:
      "Extract concrete action items from this note. Return one task per line as plain text — no bullets, numbering, or extra commentary. If there are none, return 'No action items found.'",
    tasks: true,
  },
];

type Phase = "idle" | "busy" | "result" | "error";

export default function AiPanel({
  note,
  editor,
}: {
  note: Note;
  editor: BlockNoteEditor;
}) {
  const hasKey = useAi((s) => s.hasKey);
  const complete = useAi((s) => s.complete);
  const openSettings = useAi((s) => s.setSettingsOpen);
  const addTask = useTasks((s) => s.add);
  const showToast = useUI((s) => s.showToast);
  const setView = useUI((s) => s.setView);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  const [lastAction, setLastAction] = useState<AiAction | null>(null);

  const close = () => {
    setOpen(false);
    setPhase("idle");
    setResult("");
    setError("");
  };

  const run = async (action: AiAction) => {
    setLastAction(action);
    setPhase("busy");
    setError("");
    const context = note.body_text.slice(0, CONTEXT_LIMIT);
    const prompt = `${action.instruction}\n\nNote content:\n"""\n${context}\n"""`;
    try {
      const text = await complete(prompt);
      setResult(text.trim());
      setPhase("result");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const runCustom = () => {
    const instruction = custom.trim();
    if (!instruction) return;
    setCustom("");
    run({ id: "custom", label: instruction, icon: Sparkles, instruction });
  };

  const insert = () => {
    const doc = editor.document;
    const blocks = result
      .split("\n")
      .map((line) => ({ type: "paragraph" as const, content: line.trim() }));
    editor.insertBlocks(blocks, doc[doc.length - 1], "after");
    close();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      showToast("Copied to clipboard");
    } catch {
      showToast("Couldn't access the clipboard");
    }
  };

  const addAsTasks = async () => {
    const lines = result
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter((l) => l && !/^no action items/i.test(l));
    for (const line of lines) await addTask(line);
    close();
    showToast(`Added ${lines.length} task${lines.length === 1 ? "" : "s"}`, {
      label: "View",
      run: () => setView("tasks"),
    });
  };

  return (
    <div className="no-drag relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "rounded-md p-1.5 transition",
          open
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-elevated hover:text-accent"
        )}
        title="AI assistant"
      >
        <Sparkles size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={close} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute right-0 top-9 z-30 w-[340px] overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
            >
              {!hasKey ? (
                <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
                  <Sparkles size={22} className="text-accent" />
                  <p className="text-[13px] font-medium">Connect an AI provider</p>
                  <p className="text-[12px] text-muted">
                    Add your own Anthropic or OpenAI API key to use AI on your
                    notes. Keys stay on this device.
                  </p>
                  <button
                    onClick={() => {
                      close();
                      openSettings(true);
                    }}
                    className="mt-1 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
                  >
                    <Settings2 size={14} /> Open Settings
                  </button>
                </div>
              ) : phase === "busy" ? (
                <div className="flex flex-col items-center gap-2.5 px-5 py-8">
                  <Loader2 size={20} className="animate-spin text-accent" />
                  <p className="text-[12.5px] text-muted">
                    {lastAction?.label ?? "Thinking"}…
                  </p>
                </div>
              ) : phase === "result" ? (
                <div className="flex flex-col">
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed">
                    {result}
                  </div>
                  <div className="flex items-center gap-1 border-t border-border p-1.5">
                    <button
                      onClick={() => setPhase("idle")}
                      className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
                      title="Back"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <span className="flex-1" />
                    {lastAction?.tasks ? (
                      <button
                        onClick={addAsTasks}
                        className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90"
                      >
                        <ListPlus size={13} /> Add as tasks
                      </button>
                    ) : (
                      <button
                        onClick={insert}
                        className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90"
                      >
                        <CornerDownLeft size={13} /> Insert below
                      </button>
                    )}
                    <button
                      onClick={copy}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted transition hover:bg-elevated hover:text-text"
                    >
                      <ClipboardCopy size={13} /> Copy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col p-1.5">
                  {phase === "error" && (
                    <div className="mx-1 mb-1 rounded-lg bg-red-500/10 px-2.5 py-2 text-[12px] text-red-500">
                      {error}
                    </div>
                  )}
                  {ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => run(action)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-elevated"
                    >
                      <action.icon size={14} className="shrink-0 text-accent" />
                      {action.label}
                    </button>
                  ))}
                  <div className="mx-1 my-1 border-t border-border" />
                  <div className="flex items-center gap-1.5 px-1 pb-1">
                    <input
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runCustom()}
                      placeholder="Ask AI about this note…"
                      className="min-w-0 flex-1 rounded-lg bg-elevated/60 px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-muted"
                    />
                    <button
                      onClick={runCustom}
                      disabled={!custom.trim()}
                      className="rounded-lg bg-accent p-1.5 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Run"
                    >
                      <CornerDownLeft size={13} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
