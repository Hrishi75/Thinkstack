import { useEffect } from "react";
import { Trash2, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNotes } from "../../store/notes";
import { useUI } from "../../store/ui";
import { announce } from "../../store/notifications";
import ConfirmButton from "../../components/ConfirmButton";
import { EmptyState } from "../../components/ui";
import { relativeTime } from "../../lib/util";

export default function TrashView() {
  const trashed = useNotes((s) => s.trashed);
  const loadTrash = useNotes((s) => s.loadTrash);
  const restore = useNotes((s) => s.restore);
  const removeForever = useNotes((s) => s.removeForever);
  const emptyTrash = useNotes((s) => s.emptyTrash);
  const select = useNotes((s) => s.select);
  const setView = useUI((s) => s.setView);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const restoreAndShow = async (id: string) => {
    await restore(id);
    void announce({
      kind: "note",
      title: "Note restored",
      link: { kind: "note", id },
      toast: {
        label: "Open",
        run: () => {
          select(id);
          setView("notes");
        },
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center justify-between px-6">
        <h2 className="no-drag text-lg font-semibold tracking-tight">Trash</h2>
        {trashed.length > 0 && (
          <ConfirmButton
            label="Empty trash"
            confirmLabel={`Delete ${trashed.length} forever?`}
            onConfirm={() => emptyTrash()}
            className="no-drag"
          />
        )}
      </header>

      {trashed.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          hint="Notes you delete land here and can be restored."
        />
      ) : (
        <div className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto px-6 pb-10">
          <AnimatePresence initial={false}>
            {trashed.map((note) => (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface">
                  <span className="text-[17px] leading-none">{note.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-text">
                      {note.title || "Untitled"}
                    </div>
                    <div className="truncate text-[11.5px] text-muted">
                      trashed {relativeTime(note.updated_at)}
                      {note.body_text && <> · {note.body_text.slice(0, 60)}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreAndShow(note.id)}
                    title="Restore note"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted opacity-0 transition hover:bg-elevated hover:text-text group-hover:opacity-100"
                  >
                    <Undo2 size={13} /> Restore
                  </button>
                  <ConfirmButton
                    label={<X size={14} />}
                    confirmLabel="Delete forever?"
                    onConfirm={() => removeForever(note.id)}
                    className="opacity-0 group-hover:opacity-100"
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
