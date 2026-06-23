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
import { Plus, CheckSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTasks } from "../../store/tasks";
import { cn } from "../../lib/util";
import TaskItem from "./TaskItem";

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
    add(draft);
    setDraft("");
  };

  const remaining = tasks.filter((t) => !t.done).length;
  const completedCount = tasks.length - remaining;
  const visible = tasks.filter((t) =>
    filter === "active" ? !t.done : filter === "completed" ? t.done : true
  );

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center px-6" />
      <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col overflow-hidden px-6">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <span className="text-sm text-muted">{remaining} remaining</span>
        </div>

        <form onSubmit={submit} className="no-drag mb-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-accent/50">
            <Plus size={17} className="text-muted" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a task and press Enter"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
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
                    "rounded-md px-2.5 py-1 text-[12.5px] transition",
                    filter === key
                      ? "bg-elevated font-medium text-text"
                      : "text-muted hover:bg-elevated/60 hover:text-text"
                  )}
                >
                  {label}
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
