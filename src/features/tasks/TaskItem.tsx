import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Flag, X } from "lucide-react";
import { useTasks } from "../../store/tasks";
import type { Task } from "../../lib/types";
import { cn } from "../../lib/util";

const PRIORITY_COLOR = ["text-muted", "text-sky-500", "text-amber-500", "text-red-500"];

export default function TaskItem({ task }: { task: Task }) {
  const toggle = useTasks((s) => s.toggle);
  const update = useTasks((s) => s.update);
  const remove = useTasks((s) => s.remove);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cyclePriority = () => update(task.id, { priority: (task.priority + 1) % 4 });

  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && !task.done && due.getTime() < Date.now();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-surface"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted opacity-0 transition group-hover:opacity-100"
        title="Drag to reorder"
      >
        <GripVertical size={15} />
      </button>

      <button
        onClick={() => toggle(task.id)}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition",
          task.done
            ? "border-accent bg-accent text-white"
            : "border-border hover:border-accent"
        )}
      >
        {task.done ? <Check size={13} strokeWidth={3} /> : null}
      </button>

      <input
        value={task.title}
        onChange={(e) => update(task.id, { title: e.target.value })}
        className={cn(
          "flex-1 bg-transparent text-sm outline-none",
          !!task.done && "text-muted line-through"
        )}
      />

      {due && (
        <span
          className={cn(
            "text-xs",
            overdue ? "text-red-500" : "text-muted"
          )}
        >
          {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}

      <label className="cursor-pointer text-muted opacity-0 transition group-hover:opacity-100">
        <input
          type="date"
          className="sr-only"
          onChange={(e) =>
            update(task.id, {
              due_at: e.target.value ? new Date(e.target.value).getTime() : null,
            })
          }
        />
        <span className="text-[11px] underline decoration-dotted">date</span>
      </label>

      <button
        onClick={cyclePriority}
        className={cn(
          "opacity-0 transition group-hover:opacity-100",
          PRIORITY_COLOR[task.priority],
          task.priority > 0 && "opacity-100"
        )}
        title="Cycle priority"
      >
        <Flag size={14} />
      </button>

      <button
        onClick={() => remove(task.id)}
        className="text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
        title="Delete"
      >
        <X size={15} />
      </button>
    </div>
  );
}
