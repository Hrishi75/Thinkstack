import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Flag } from "lucide-react";
import { useTasks } from "../../store/tasks";
import { useUI } from "../../store/ui";
import { cn } from "../../lib/util";
import { dueLabel, dueTooltip } from "../../lib/dates";
import { reminderLabel } from "../../lib/notifications";
import {
  Popover,
  DueMenu,
  PriorityMenu,
  ScheduleSummary,
  PRIORITIES,
} from "./menus";

/** Full task-creation dialog: title, description, due date & time, priority. */
export default function NewTaskModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const add = useTasks((s) => s.add);
  const showToast = useUI((s) => s.showToast);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState<number | null>(null);
  const [hasTime, setHasTime] = useState(0);
  const [priority, setPriority] = useState(0);
  const [menu, setMenu] = useState<"due" | "priority" | null>(null);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setDue(null);
      setHasTime(0);
      setPriority(0);
      setMenu(null);
    }
  }, [open]);

  const canCreate = title.trim().length > 0;
  const prio = PRIORITIES[priority] ?? PRIORITIES[0];

  const create = async () => {
    if (!canCreate) return;
    await add(title, {
      description,
      due_at: due,
      due_has_time: hasTime,
      priority,
    });
    if (due !== null) {
      const remind = reminderLabel(due, hasTime);
      showToast(
        remind
          ? `Task added — reminds ${remind}`
          : "Task added — no reminder, that time already passed"
      );
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[14vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create();
          }}
        >
          <motion.div
            className="w-full max-w-md rounded-xl border border-border bg-surface shadow-pop"
            initial={{ scale: 0.98, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: -8 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pb-1 pt-3.5 text-[11px] font-medium uppercase tracking-wide text-muted/70">
              New task
            </div>

            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  create();
                }
              }}
              placeholder="Task title"
              className="w-full bg-transparent px-4 py-1.5 text-[15px] font-medium outline-none placeholder:text-muted/60"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add a description… (optional)"
              className="w-full resize-none bg-transparent px-4 py-1 text-sm leading-relaxed outline-none placeholder:text-muted/60"
            />

            <div className="flex items-center gap-1.5 px-3 pt-1">
              {/* due date */}
              <span className="relative">
                <button
                  type="button"
                  onClick={() => setMenu((m) => (m === "due" ? null : "due"))}
                  title={due !== null ? dueTooltip(due, hasTime) : "Due date"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition hover:bg-elevated",
                    due !== null ? "text-accent" : "text-muted"
                  )}
                >
                  <CalendarDays size={13} />
                  {due !== null ? dueLabel(due, hasTime) : "Due date"}
                </button>
                <Popover
                  open={menu === "due"}
                  onClose={() => setMenu(null)}
                  className="w-56"
                >
                  <DueMenu
                    dueAt={due}
                    hasTime={hasTime}
                    onChange={(dueAt, ht, close) => {
                      setDue(dueAt);
                      setHasTime(ht);
                      if (close) setMenu(null);
                    }}
                  />
                </Popover>
              </span>

              {/* priority */}
              <span className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setMenu((m) => (m === "priority" ? null : "priority"))
                  }
                  title={`Priority: ${prio.label}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition hover:bg-elevated",
                    priority > 0 ? prio.cls : "text-muted"
                  )}
                >
                  <Flag
                    size={13}
                    className={priority > 0 ? "fill-current" : ""}
                  />
                  {priority > 0 ? prio.label : "Priority"}
                </button>
                <Popover
                  open={menu === "priority"}
                  onClose={() => setMenu(null)}
                  className="w-36"
                >
                  <PriorityMenu
                    value={priority}
                    onPick={(p) => {
                      setPriority(p);
                      setMenu(null);
                    }}
                  />
                </Popover>
              </span>
            </div>

            {due !== null && (
              <ScheduleSummary
                dueAt={due}
                hasTime={hasTime}
                onClear={() => {
                  setDue(null);
                  setHasTime(0);
                }}
                className="mx-4 mt-2.5 border-t border-border/60 pt-2"
              />
            )}

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <span className="pl-1 text-[11px] text-muted/70">
                ⏎ create · esc close
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-elevated hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={!canCreate}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium text-white transition",
                    canCreate
                      ? "bg-accent hover:opacity-90"
                      : "cursor-not-allowed bg-accent/40"
                  )}
                >
                  Create task
                </button>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
