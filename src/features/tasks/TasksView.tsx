import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus, CheckSquare, CalendarDays, Flag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTasks } from "../../store/tasks";
import { cn } from "../../lib/util";
import { dueLabel, dueTooltip } from "../../lib/dates";
import TaskItem from "./TaskItem";
import { Popover, DueMenu, PriorityMenu, PRIORITIES } from "./menus";

type Filter = "all" | "active" | "completed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

export default function TasksView() {
  const tasks = useTasks((s) => s.tasks);
  const add = useTasks((s) => s.add);
  const reorder = useTasks((s) => s.reorder);
  const clearCompleted = useTasks((s) => s.clearCompleted);
  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState<number | null>(null);
  const [draftDueHasTime, setDraftDueHasTime] = useState(0);
  const [draftPriority, setDraftPriority] = useState(0);
  const [composerMenu, setComposerMenu] = useState<"due" | "priority" | null>(
    null
  );
  const [filter, setFilter] = useState<Filter>("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = tasks.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    reorder(arrayMove(ids, from, to));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Keep any picked due/priority when Enter lands on an empty title.
    if (!draft.trim()) return;
    add(draft, {
      due_at: draftDue,
      due_has_time: draftDueHasTime,
      priority: draftPriority,
    });
    setDraft("");
    setDraftDue(null);
    setDraftDueHasTime(0);
    setDraftPriority(0);
    setComposerMenu(null);
  };

  const draftPrio = PRIORITIES[draftPriority] ?? PRIORITIES[0];

  const remaining = tasks.filter((t) => !t.done).length;
  const completedCount = tasks.length - remaining;
  const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const visible = tasks.filter((t) =>
    filter === "active" ? !t.done : filter === "completed" ? t.done : true
  );
  const filterCount = (key: Filter) =>
    key === "active" ? remaining : key === "completed" ? completedCount : tasks.length;

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center px-6" />
      <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col overflow-hidden px-6">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <span className="text-sm text-muted">
            {remaining === 0 && tasks.length > 0
              ? "All done 🎉"
              : `${remaining} remaining`}
          </span>
        </div>

        {tasks.length > 0 && (
          <div className="mb-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted">
              {completedCount}/{tasks.length}
            </span>
          </div>
        )}

        <form onSubmit={submit} className="no-drag mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-accent/50">
            <Plus size={17} className="text-muted" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a task and press Enter"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />

            {/* due date for the new task */}
            <span className="relative shrink-0">
              <button
                type="button"
                onClick={() =>
                  setComposerMenu((m) => (m === "due" ? null : "due"))
                }
                title={
                  draftDue !== null
                    ? dueTooltip(draftDue, draftDueHasTime)
                    : "Due date"
                }
                className={cn(
                  "flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition hover:bg-elevated",
                  draftDue !== null ? "text-accent" : "text-muted"
                )}
              >
                <CalendarDays size={14} />
                {draftDue !== null && dueLabel(draftDue, draftDueHasTime)}
              </button>
              <Popover
                open={composerMenu === "due"}
                onClose={() => setComposerMenu(null)}
                className="w-56"
              >
                <DueMenu
                  dueAt={draftDue}
                  hasTime={draftDueHasTime}
                  onChange={(dueAt, hasTime, close) => {
                    setDraftDue(dueAt);
                    setDraftDueHasTime(hasTime);
                    if (close) setComposerMenu(null);
                  }}
                />
              </Popover>
            </span>

            {/* priority for the new task */}
            <span className="relative shrink-0">
              <button
                type="button"
                onClick={() =>
                  setComposerMenu((m) => (m === "priority" ? null : "priority"))
                }
                title={`Priority: ${draftPrio.label}`}
                className={cn(
                  "rounded-md p-1 transition hover:bg-elevated",
                  draftPriority > 0 ? draftPrio.cls : "text-muted"
                )}
              >
                <Flag
                  size={14}
                  className={draftPriority > 0 ? "fill-current" : ""}
                />
              </button>
              <Popover
                open={composerMenu === "priority"}
                onClose={() => setComposerMenu(null)}
                className="w-36"
              >
                <PriorityMenu
                  value={draftPriority}
                  onPick={(p) => {
                    setDraftPriority(p);
                    setComposerMenu(null);
                  }}
                />
              </Popover>
            </span>
          </div>
        </form>

        {tasks.length > 0 && (
          <div className="no-drag mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition",
                    filter === key
                      ? "bg-elevated font-medium text-text"
                      : "text-muted hover:bg-elevated/60 hover:text-text"
                  )}
                >
                  {label}
                  <span className="text-[10.5px] tabular-nums opacity-60">
                    {filterCount(key)}
                  </span>
                </button>
              ))}
            </div>
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="rounded-md px-2 py-1 text-[12px] text-muted transition hover:text-red-500"
              >
                Clear completed
              </button>
            )}
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
            <CheckSquare size={28} className="opacity-40" />
            <p>No tasks yet — add one above.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
            <CheckSquare size={28} className="opacity-40" />
            <p>
              {filter === "completed"
                ? "No completed tasks yet."
                : "Nothing here — all done!"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-10">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={visible.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <AnimatePresence initial={false}>
                  {visible.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <TaskItem task={task} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
