import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { useNotes } from "../../store/notes";
import { tagStyle, tagHex } from "./tagStyle";

/** Tag chips + an inline add field for a single note, shown under its title. */
export default function TagBar({ noteId }: { noteId: string }) {
  const noteTags = useNotes((s) => s.noteTags[noteId] ?? []);
  const allTags = useNotes((s) => s.tags);
  const addTag = useNotes((s) => s.addTag);
  const removeTag = useNotes((s) => s.removeTag);

  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const attachedIds = useMemo(
    () => new Set(noteTags.map((t) => t.id)),
    [noteTags]
  );
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    return allTags
      .filter((t) => !attachedIds.has(t.id) && t.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allTags, value, attachedIds]);

  const commit = async (name: string) => {
    if (name.trim()) await addTag(noteId, name);
    setValue("");
    setAdding(false);
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {noteTags.map((t) => (
        <span
          key={t.id}
          style={tagStyle(t.color)}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
        >
          {t.name}
          <button
            onClick={() => removeTag(noteId, t.id)}
            className="opacity-50 transition hover:opacity-100"
            title="Remove tag"
          >
            <X size={11} />
          </button>
        </span>
      ))}

      {adding ? (
        <div className="relative">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(value);
              } else if (e.key === "Escape") {
                setValue("");
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (!value.trim()) setAdding(false);
            }}
            placeholder="Add tag…"
            className="h-6 w-28 rounded-full border border-border bg-surface px-2.5 text-xs outline-none focus:border-accent"
          />
          {value.trim() && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  // mousedown fires before the input's blur, so the field stays alive
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(t.name);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition hover:bg-elevated"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tagHex(t.color) }}
                  />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted transition hover:border-accent hover:text-text"
        >
          <Plus size={11} /> Tag
        </button>
      )}
    </div>
  );
}
