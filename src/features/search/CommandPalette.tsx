import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  FileText,
  CheckSquare,
  CalendarDays,
  StickyNote,
  Trash2,
  Plus,
  Moon,
  Sun,
  Loader2,
  X,
} from "lucide-react";
import { useUI, type View } from "../../store/ui";
import { useNotes } from "../../store/notes";
import { useSticky } from "../../store/sticky";
import { searchNotes } from "../../lib/repo";
import type { SearchHit } from "../../lib/types";
import { cn, relativeTime } from "../../lib/util";

interface Action {
  id: string;
  label: string;
  icon: typeof FileText;
  hint?: string;
  run: () => void | Promise<void>;
}

/** A note row in the results list — either a recent note or a search hit. */
interface NoteItem {
  id: string;
  icon: string;
  title: string;
  sub: React.ReactNode;
}

/** Render an FTS snippet, turning ⟦match⟧ markers into highlighted spans. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/⟦|⟧/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded-sm bg-accent/20 px-px font-medium text-text">
            {p}
          </span>
        ) : (
          p
        )
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted/70">
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-black/[0.04] px-1 py-0.5 text-[10px] leading-none text-muted dark:bg-white/[0.06]">
      {children}
    </kbd>
  );
}

export default function CommandPalette() {
  const open = useUI((s) => s.commandOpen);
  const setOpen = useUI((s) => s.setCommandOpen);
  const setView = useUI((s) => s.setView);
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const notes = useNotes((s) => s.notes);
  const select = useNotes((s) => s.select);
  const createNote = useNotes((s) => s.create);
  const createSticky = useSticky((s) => s.create);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions = useMemo<Action[]>(() => {
    const goto = (view: View, label: string, icon: typeof FileText): Action => ({
      id: `goto-${view}`,
      label,
      icon,
      run: () => setView(view),
    });
    return [
      {
        id: "new-note",
        label: "New note",
        icon: Plus,
        hint: "⌘N",
        run: async () => {
          await createNote();
          setView("notes");
        },
      },
      {
        id: "new-sticky",
        label: "New sticky note",
        icon: StickyNote,
        run: async () => {
          const s = await createSticky();
          await invoke("open_sticky", { id: s.id });
        },
      },
      goto("notes", "Go to Notes", FileText),
      goto("tasks", "Go to Tasks", CheckSquare),
      goto("calendar", "Go to Calendar", CalendarDays),
      goto("sticky", "Go to Sticky Notes", StickyNote),
      goto("trash", "Go to Trash", Trash2),
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: theme === "dark" ? Sun : Moon,
        run: toggleTheme,
      },
    ];
  }, [setView, createNote, createSticky, theme, toggleTheme]);

  const hasQuery = query.trim().length > 0;

  const visibleActions = useMemo(() => {
    if (!hasQuery) return actions;
    const terms = query.trim().toLowerCase().split(/\s+/);
    return actions.filter((a) =>
      terms.every((t) => a.label.toLowerCase().includes(t))
    );
  }, [actions, query, hasQuery]);

  // With no query, offer the most recently edited notes (Notion-style "Recent").
  const noteItems = useMemo<NoteItem[]>(() => {
    if (hasQuery) {
      const iconOf = (id: string) =>
        notes.find((n) => n.id === id)?.icon ?? "📄";
      return hits.map((h) => ({
        id: h.note_id,
        icon: iconOf(h.note_id),
        title: h.title || "Untitled",
        sub: <Snippet text={h.snippet} />,
      }));
    }
    return [...notes]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 5)
      .map((n) => ({
        id: n.id,
        icon: n.icon,
        title: n.title || "Untitled",
        sub: (
          <>
            {relativeTime(n.updated_at)}
            {n.body_text && <> · {n.body_text.slice(0, 60)}</>}
          </>
        ),
      }));
  }, [hasQuery, hits, notes]);

  const total = visibleActions.length + noteItems.length;

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setSearching(false);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (query.trim()) setSearching(true);
    const t = setTimeout(async () => {
      const results = query.trim() ? await searchNotes(query) : [];
      if (!cancelled) {
        setHits(results);
        setSearching(false);
        setActive(0);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Keep the active row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const clearQuery = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const runItem = async (index: number) => {
    if (index < visibleActions.length) {
      setOpen(false);
      await visibleActions[index].run();
    } else {
      const item = noteItems[index - visibleActions.length];
      if (!item) return;
      setView("notes");
      select(item.id);
      setOpen(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (query) clearQuery();
      else setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && total > 0) {
      e.preventDefault();
      runItem(active);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
            initial={{ scale: 0.98, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: -8 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              {searching ? (
                <Loader2 size={17} className="shrink-0 animate-spin text-muted" />
              ) : (
                <Search size={17} className="shrink-0 text-muted" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search notes or run a command…"
                className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-muted/70"
              />
              {query && (
                <button
                  onClick={clearQuery}
                  className="shrink-0 rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
                  title="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
              {visibleActions.length > 0 && (
                <>
                  <SectionLabel>Actions</SectionLabel>
                  {visibleActions.map((action, i) => (
                    <button
                      key={action.id}
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => runItem(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left",
                        i === active ? "bg-accent/15" : "hover:bg-elevated"
                      )}
                    >
                      <action.icon size={15} className="shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm">{action.label}</span>
                      {action.hint && <Kbd>{action.hint}</Kbd>}
                    </button>
                  ))}
                </>
              )}

              {noteItems.length > 0 && (
                <SectionLabel>{hasQuery ? "Notes" : "Recent"}</SectionLabel>
              )}
              {noteItems.map((item, i) => {
                const index = visibleActions.length + i;
                return (
                  <button
                    key={item.id}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => runItem(index)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left",
                      index === active ? "bg-accent/15" : "hover:bg-elevated"
                    )}
                  >
                    <span className="mt-px w-[18px] shrink-0 text-center text-[15px] leading-snug">
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.title}</div>
                      <div className="truncate text-xs text-muted">{item.sub}</div>
                    </div>
                  </button>
                );
              })}

              {hasQuery && !searching && total === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted">
                  <p>
                    No results for “
                    <span className="text-text">{query.trim()}</span>”
                  </p>
                  <p className="mt-1 text-xs text-muted/70">
                    Try different keywords, or press <Kbd>esc</Kbd> to clear.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted/80">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> open
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd> {query ? "clear" : "close"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
