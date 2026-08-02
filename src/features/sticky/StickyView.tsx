import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, StickyNote, X, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSticky } from "../../store/sticky";
import { STICKY_COLORS } from "../../lib/types";
import { Button, EmptyState } from "../../components/ui";

export default function StickyView() {
  const stickies = useSticky((s) => s.stickies);
  const create = useSticky((s) => s.create);
  const remove = useSticky((s) => s.remove);
  const setColor = useSticky((s) => s.setColor);
  const load = useSticky((s) => s.load);

  // Refresh content edited in floating sticky windows.
  useEffect(() => {
    load();
  }, [load]);

  const newSticky = async () => {
    const s = await create();
    await invoke("open_sticky", { id: s.id });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center justify-between px-6">
        <h2 className="no-drag text-lg font-semibold tracking-tight">
          Sticky Notes
        </h2>
        <Button variant="primary" size="lg" className="no-drag" onClick={newSticky}>
          <Plus size={15} /> New sticky
        </Button>
      </header>

      {stickies.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No sticky notes yet"
          hint="Stickies float above every other window — perfect for the thing you must not forget."
        >
          <Button variant="primary" onClick={newSticky}>
            <Plus size={13} /> Create a sticky
          </Button>
        </EmptyState>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 overflow-y-auto p-6 pt-2">
          <AnimatePresence>
            {stickies.map((s) => {
              const c = STICKY_COLORS[s.color] ?? STICKY_COLORS.yellow;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -3 }}
                  onClick={() => invoke("open_sticky", { id: s.id })}
                  style={{ background: c.bg, color: c.text }}
                  className="group relative flex aspect-square cursor-pointer flex-col rounded-xl p-3 text-sm shadow-soft"
                >
                  <p className="line-clamp-6 flex-1 whitespace-pre-wrap break-words">
                    {s.content || "Empty note"}
                  </p>
                  <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <ExternalLink size={14} className="opacity-60" />
                  </div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    {Object.entries(STICKY_COLORS).map(([name, col]) => (
                      <button
                        key={name}
                        onClick={(e) => {
                          e.stopPropagation();
                          setColor(s.id, name);
                        }}
                        style={{ background: col.bg }}
                        title={name}
                        className={
                          "h-3.5 w-3.5 rounded-full ring-1 ring-black/15 transition hover:scale-110" +
                          (s.color === name ? " ring-2 ring-black/40" : "")
                        }
                      />
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(s.id);
                    }}
                    className="absolute bottom-2 right-2 rounded p-1 opacity-0 transition hover:bg-black/10 group-hover:opacity-100"
                    title="Delete"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
