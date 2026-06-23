import { useRef, useMemo, lazy, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, FileText, Pin } from "lucide-react";
import { useNotes } from "../../store/notes";
import { cn } from "../../lib/util";
import { tagStyle, tagHex } from "./tagStyle";

// Lazy-load the heavy BlockNote editor to keep cold start fast.
const NoteEditor = lazy(() => import("./NoteEditor"));

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotesView() {
  const notes = useNotes((s) => s.notes);
  const selectedId = useNotes((s) => s.selectedId);
  const select = useNotes((s) => s.select);
  const create = useNotes((s) => s.create);
  const togglePin = useNotes((s) => s.togglePin);
  const tags = useNotes((s) => s.tags);
  const noteTags = useNotes((s) => s.noteTags);
  const activeTagId = useNotes((s) => s.activeTagId);
  const setActiveTag = useNotes((s) => s.setActiveTag);

  const visibleNotes = useMemo(() => {
    if (!activeTagId) return notes;
    return notes.filter((n) =>
      (noteTags[n.id] ?? []).some((t) => t.id === activeTagId)
    );
  }, [notes, noteTags, activeTagId]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleNotes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const selected = notes.find((n) => n.id === selectedId);

  return (
    <div className="flex h-full">
      {/* List column */}
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border/70 bg-surface">
        <div className="drag-region h-10 shrink-0" />
        <div className="flex items-center justify-between px-3 pb-1.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Notes
          </h2>
          <button
            onClick={() => create()}
            className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
            title="New note"
          >
            <Plus size={16} />
          </button>
        </div>

        {tags.length > 0 && (
          <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
            {tags.map((t) => {
              const active = activeTagId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTag(t.id)}
                  style={active ? tagStyle(t.color) : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                    !active &&
                      "border-border text-muted hover:border-border hover:text-text"
                  )}
                  title={active ? "Clear filter" : `Filter by ${t.name}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: tagHex(t.color) }}
                  />
                  {t.name}
                  <span className="opacity-60">{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {notes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
            <FileText size={28} className="opacity-40" />
            <p>No notes yet.</p>
            <button
              onClick={() => create()}
              className="mt-1 rounded-md bg-accent/15 px-3 py-1.5 text-accent transition hover:bg-accent/25"
            >
              Create your first note
            </button>
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
            <FileText size={28} className="opacity-40" />
            <p>No notes with this tag.</p>
            <button
              onClick={() => setActiveTag(activeTagId)}
              className="mt-1 rounded-md bg-elevated px-3 py-1.5 text-text transition hover:bg-elevated/70"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-y-auto px-2 pb-3">
            <div
              style={{ height: virtualizer.getTotalSize(), position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const note = visibleNotes[row.index];
                const rowTags = noteTags[note.id] ?? [];
                return (
                  <div
                    key={note.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: row.size,
                      transform: `translateY(${row.start}px)`,
                    }}
                    className="group/row relative px-1 py-0.5"
                  >
                    <button
                      onClick={() => select(note.id)}
                      className={cn(
                        "flex h-full w-full flex-col justify-center gap-0.5 rounded-md px-2.5 pr-8 text-left transition",
                        selectedId === note.id
                          ? "bg-elevated"
                          : "hover:bg-elevated/60"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate text-[13.5px] font-medium text-text">
                        <span className="text-[15px] leading-none">{note.icon}</span>
                        <span className="truncate">{note.title || "Untitled"}</span>
                      </div>
                      <div className="flex items-center gap-1 truncate pl-[23px] text-[11.5px] text-muted">
                        {rowTags.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tagHex(t.color) }}
                          />
                        ))}
                        <span className="truncate">
                          {relativeTime(note.updated_at)} ·{" "}
                          {note.body_text.slice(0, 40) || "Empty"}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => togglePin(note.id)}
                      title={note.pinned ? "Unpin note" : "Pin note"}
                      className={cn(
                        "absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 transition",
                        note.pinned
                          ? "text-accent opacity-100"
                          : "text-muted opacity-0 hover:bg-elevated hover:text-text group-hover/row:opacity-100"
                      )}
                    >
                      <Pin
                        size={13}
                        className={note.pinned ? "fill-current" : ""}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Editor column */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Loading editor…
              </div>
            }
          >
            <NoteEditor key={selected.id} note={selected} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Select or create a note
          </div>
        )}
      </div>
    </div>
  );
}
