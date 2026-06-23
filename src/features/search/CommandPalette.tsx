import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, FileText } from "lucide-react";
import { useUI } from "../../store/ui";
import { useNotes } from "../../store/notes";
import { searchNotes } from "../../lib/repo";
import type { SearchHit } from "../../lib/types";
import { cn } from "../../lib/util";

export default function CommandPalette() {
  const open = useUI((s) => s.commandOpen);
  const setOpen = useUI((s) => s.setCommandOpen);
  const setView = useUI((s) => s.setView);
  const select = useNotes((s) => s.select);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const results = query.trim() ? await searchNotes(query) : [];
      if (!cancelled) {
        setHits(results);
        setActive(0);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const choose = (hit: SearchHit) => {
    setView("notes");
    select(hit.note_id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      choose(hits[active]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-pop"
            initial={{ scale: 0.97, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: -8 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search size={17} className="text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search notes…"
                className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {query.trim() && hits.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted">
                  No matches
                </div>
              )}
              {hits.map((hit, i) => (
                <button
                  key={hit.note_id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(hit)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left",
                    i === active ? "bg-accent/15" : "hover:bg-elevated"
                  )}
                >
                  <FileText size={15} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {hit.title || "Untitled"}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {hit.snippet.replace(/⟦|⟧/g, "")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
