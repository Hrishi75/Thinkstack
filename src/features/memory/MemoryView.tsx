import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Brain, Plus, Trash2, Eye, EyeOff, Sparkles } from "lucide-react";
import { useMemory, buildMemoryContext } from "../../store/memory";
import { useAi } from "../../store/ai";
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_KEYS,
  toMemoryCategory,
  type Memory,
  type MemoryCategory,
} from "../../lib/types";
import { cn, debounce, relativeTime } from "../../lib/util";
import { Button, PillTabs } from "../../components/ui";

/** Category-specific prompts, so an empty card still shows what belongs in it. */
const PLACEHOLDERS: Record<MemoryCategory, string> = {
  company:
    "e.g. We're Acme — a 40-person B2B logistics company. Our customers are mid-size freight brokers in the EU. Fiscal year starts in April.",
  product:
    "e.g. Our main product is Relay, a shipment-tracking dashboard. Priced per seat. The mobile app is in beta.",
  people:
    "e.g. Priya leads engineering, Sam runs sales, I report to the COO. Refer to the leadership team as 'the LT'.",
  projects:
    "e.g. This quarter's priority is the billing rebuild (codename Atlas). The Nordics launch is paused until Q4.",
  style:
    "e.g. Write in plain English, no exclamation marks, British spelling. Keep summaries to five bullets or fewer.",
  general: "Anything the AI should always know before answering…",
};

/** One-click scaffolds for a first-run workspace. */
const STARTERS: { title: string; category: MemoryCategory }[] = [
  { title: "Company overview", category: "company" },
  { title: "What we sell", category: "product" },
  { title: "Who's who", category: "people" },
  { title: "Writing style", category: "style" },
];

function Toggle({
  on,
  onClick,
  title,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full transition",
        on ? "bg-accent" : "bg-elevated"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-soft transition-all",
          on ? "left-[16px]" : "left-[2px]"
        )}
      />
    </button>
  );
}

function MemoryCard({ memory, autoFocus }: { memory: Memory; autoFocus: boolean }) {
  const update = useMemory((s) => s.update);
  const toggle = useMemory((s) => s.toggle);
  const remove = useMemory((s) => s.remove);

  const [title, setTitle] = useState(memory.title);
  const [content, setContent] = useState(memory.content);
  const [confirming, setConfirming] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const category = toMemoryCategory(memory.category);
  const enabled = memory.enabled === 1;

  // Autosave while typing; flush on unmount so switching views never drops edits.
  const save = useMemo(
    () => debounce((patch: Partial<Memory>) => update(memory.id, patch), 500),
    [memory.id, update]
  );
  useEffect(() => () => save.flush(), [save]);

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  // Grow the textarea to fit, so long memories are readable without scrolling.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface px-3.5 py-3 shadow-soft transition",
        !enabled && "opacity-55"
      )}
    >
      <div className="flex items-center gap-2">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save({ title: e.target.value });
          }}
          placeholder="Untitled memory"
          className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none placeholder:text-muted/60"
        />

        <select
          aria-label="Category"
          value={category}
          onChange={(e) => update(memory.id, { category: e.target.value as MemoryCategory })}
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium outline-none",
            MEMORY_CATEGORIES[category].pill
          )}
        >
          {MEMORY_CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {MEMORY_CATEGORIES[key].label}
            </option>
          ))}
        </select>

        <Toggle
          on={enabled}
          onClick={() => toggle(memory.id)}
          title={enabled ? "Included in AI context" : "Excluded from AI context"}
        />

        {confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => remove(memory.id)}
              className="rounded-md bg-red-500/10 px-2 py-1 text-[11.5px] font-medium text-red-500 transition hover:bg-red-500/20"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md px-1.5 py-1 text-[11.5px] text-muted transition hover:text-text"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-md p-1 text-muted transition hover:bg-elevated hover:text-red-500"
            title="Delete memory"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <textarea
        ref={bodyRef}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          save({ content: e.target.value });
        }}
        rows={2}
        placeholder={PLACEHOLDERS[category]}
        className="mt-1 w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-muted/60"
      />

      <div className="mt-1 text-[11px] text-muted/70">
        {enabled ? "Sent with every AI request" : "Paused"} · edited{" "}
        {relativeTime(memory.updated_at)}
      </div>
    </div>
  );
}

export default function MemoryView() {
  const memories = useMemory((s) => s.memories);
  const add = useMemory((s) => s.add);
  const hasKey = useAi((s) => s.hasKey);
  const openSettings = useAi((s) => s.setSettingsOpen);

  const [filter, setFilter] = useState<MemoryCategory | "all">("all");
  const [showPreview, setShowPreview] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const context = useMemo(() => buildMemoryContext(memories), [memories]);
  const activeCount = memories.filter((m) => m.enabled === 1 && m.content.trim()).length;
  const approxTokens = Math.round(context.length / 4);

  const visible = memories.filter(
    (m) => filter === "all" || toMemoryCategory(m.category) === filter
  );
  const countIn = (key: MemoryCategory) =>
    memories.filter((m) => toMemoryCategory(m.category) === key).length;
  const usedCategories = MEMORY_CATEGORY_KEYS.filter((k) => countIn(k) > 0);

  const create = async (seed?: Partial<Memory>) => {
    const memory = await add(seed);
    setFilter("all");
    setFocusId(memory.id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center px-6" />
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col overflow-hidden px-6">
        <div className="flex items-start justify-between pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Memory</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Standing context the AI gets on every request — so you never explain
              your company twice.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="no-drag mt-0.5"
            onClick={() => create()}
          >
            <Plus size={15} /> New memory
          </Button>
        </div>

        {memories.length > 0 && (
          <div className="no-drag mb-3 flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2">
            <Brain size={15} className="shrink-0 text-accent" />
            <span className="flex-1 text-[12.5px] text-muted">
              {activeCount === 0 ? (
                "No active memories — nothing is being sent yet."
              ) : (
                <>
                  <span className="font-medium text-text">
                    {activeCount} memor{activeCount === 1 ? "y" : "ies"}
                  </span>{" "}
                  in every AI request · ~{approxTokens.toLocaleString()} tokens
                </>
              )}
            </span>
            {context && (
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted transition hover:bg-elevated hover:text-text"
              >
                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPreview ? "Hide" : "Preview"} context
              </button>
            )}
          </div>
        )}

        <AnimatePresence>
          {showPreview && context && (
            <motion.pre
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-elevated/60 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-muted"
            >
              {context}
            </motion.pre>
          )}
        </AnimatePresence>

        {usedCategories.length > 1 && (
          <PillTabs
            className="no-drag mb-2 flex-wrap"
            items={(["all", ...usedCategories] as const).map((key) => ({
              key,
              label: key === "all" ? "All" : MEMORY_CATEGORIES[key].label,
              count: key === "all" ? memories.length : countIn(key),
            }))}
            value={filter}
            onChange={setFilter}
          />
        )}

        <div className="no-drag flex-1 overflow-y-auto pb-6">
          {memories.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Brain size={30} className="text-accent" />
              <p className="mt-3 text-[15px] font-medium">Teach it once</p>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                Write down what you'd otherwise repeat in every prompt — what your
                company does, who's on the team, how you like things written. It's
                added to every AI action across your notes.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {STARTERS.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => create(s)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-muted shadow-soft transition hover:border-accent/50 hover:text-text"
                  >
                    + {s.title}
                  </button>
                ))}
              </div>
              {!hasKey && (
                <button
                  onClick={() => openSettings(true)}
                  className="mt-5 flex items-center gap-1.5 text-[12px] text-muted underline decoration-dotted transition hover:text-text"
                >
                  <Sparkles size={12} /> Connect an AI provider to use memory
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((m) => (
                <MemoryCard key={m.id} memory={m} autoFocus={m.id === focusId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
