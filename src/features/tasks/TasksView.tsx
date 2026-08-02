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
import { Button, EmptyState, PillTabs } from "../../components/ui";
import TaskItem from "./TaskItem";
import NewTaskModal from "./NewTaskModal";

type Filter = "all" | "active" | "completed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

export default function TasksView() {
  const tasks = useTasks((s) => s.tasks);
  const reorder = useTasks((s) => s.reorder);
  const clearCompleted = useTasks((s) => s.clearCompleted);
  const [modalOpen, setModalOpen] = useState(false);
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
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Tasks</h2>
            <span className="text-[13px] text-muted">
              {remaining === 0 && tasks.length > 0
                ? "All done 🎉"
                : `${remaining} remaining`}
            </span>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="no-drag"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={15} /> New task
          </Button>
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

        {tasks.length > 0 && (
          <div className="no-drag mb-2 flex items-center justify-between">
            <PillTabs
              items={FILTERS.map(({ key, label }) => ({
                key,
                label,
                count: filterCount(key),
              }))}
              value={filter}
              onChange={setFilter}
            />
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
          <EmptyState
            icon={CheckSquare}
            title="No tasks yet"
            hint="Capture what needs doing — due dates, priorities and repeats included."
          >
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <Plus size={13} /> Create a task
            </Button>
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={
              filter === "completed"
                ? "No completed tasks yet"
                : "Nothing here — all done!"
            }
          />
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

      <NewTaskModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
