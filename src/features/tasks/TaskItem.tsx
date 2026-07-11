import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  Flag,
  Repeat,
  X,
  CalendarDays,
  Link2,
} from "lucide-react";
import { useTasks } from "../../store/tasks";
import { useNotes } from "../../store/notes";
import { useUI } from "../../store/ui";
import { RECURRENCE_LABELS, type Task } from "../../lib/types";
import { cn } from "../../lib/util";
import {
  dayStart,
  startOfToday,
  dueLabel,
  dueTooltip,
  nextOccurrence,
  dateTimeLabel,
} from "../../lib/dates";
import {
  Popover,
  MenuButton,
  DueMenu,
  PriorityMenu,
  PRIORITIES,
} from "./menus";

export default function TaskItem({ task }: { task: Task }) {
  const toggle = useTasks((s) => s.toggle);
  const update = useTasks((s) => s.update);
  const setDue = useTasks((s) => s.setDue);
  const remove = useTasks((s) => s.remove);
  const notes = useNotes((s) => s.notes);
  const selectNote = useNotes((s) => s.select);
  const setView = useUI((s) => s.setView);
  const showToast = useUI((s) => s.showToast);

  const [menu, setMenu] = useState<"due" | "priority" | "link" | null>(null);
  const [noteQuery, setNoteQuery] = useState("");

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const linkedNote = task.note_id
    ? notes.find((n) => n.id === task.note_id)
    : undefined;

  const noteMatches = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    return notes
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [notes, noteQuery]);

  const today = startOfToday();
  const dueDay = task.due_at !== null ? dayStart(task.due_at) : null;
  // A timed task turns overdue the minute it passes; an all-day one at midnight.
  const overdue =
    task.due_at !== null &&
    !task.done &&
    (task.due_has_time ? task.due_at < Date.now() : dueDay! < today);
  const dueToday = dueDay === today && !task.done && !overdue;
  const priority = PRIORITIES[task.priority] ?? PRIORITIES[0];

  const closeMenu = () => {
    setMenu(null);
    setNoteQuery("");
  };
  const openMenu = (m: "due" | "priority" | "link") =>
    setMenu((cur) => (cur === m ? null : m));

  const goToNote = () => {
    if (!linkedNote) return;
    selectNote(linkedNote.id);
    setView("notes");
  };

  // Completing a repeating task rolls forward instead of checking off, so
  // the row never animates — a toast is the only feedback the user gets.
  const completeTask = () => {
    if (!task.done && task.recur && task.due_at !== null) {
      const next = nextOccurrence(task.due_at, task.recur, task.due_has_time);
      showToast(`Completed — next ${dueLabel(next, task.due_has_time)}`);
    }
    toggle(task.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-surface"
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
        onClick={completeTask}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150",
          task.done
            ? "border-accent bg-accent text-white"
            : "border-border hover:scale-105 hover:border-accent"
        )}
      >
        {task.done ? <Check size={13} strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <input
          value={task.title}
          onChange={(e) => update(task.id, { title: e.target.value })}
          className={cn(
            "w-full bg-transparent text-sm outline-none transition-colors duration-200",
            !!task.done && "text-muted line-through"
          )}
        />
        <div className="flex items-baseline gap-1.5 text-xs text-muted">
          {task.description && (
            <span
              className={cn(
                "min-w-0 truncate",
                !!task.done && "line-through opacity-60"
              )}
              title={task.description}
            >
              {task.description}
            </span>
          )}
          <span
            className="shrink-0 whitespace-nowrap text-[10.5px] text-muted/60"
            title={`Added ${dateTimeLabel(task.created_at)}`}
          >
            Added {dateTimeLabel(task.created_at)}
          </span>
        </div>
      </div>

      {/* linked note chip */}
      {linkedNote && (
        <button
          onClick={goToNote}
          title={`Open “${linkedNote.title}”`}
          className="flex max-w-[140px] shrink-0 items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-muted transition hover:border-accent/50 hover:text-text"
        >
          <span className="text-[12px] leading-none">{linkedNote.icon}</span>
          <span className="truncate">{linkedNote.title || "Untitled"}</span>
        </button>
      )}

      {/* due date */}
      <span className="relative shrink-0">
        <button
          onClick={() => openMenu("due")}
          title={
            task.due_at !== null
              ? dueTooltip(task.due_at, task.due_has_time) +
                (task.recur
                  ? ` · Repeats ${RECURRENCE_LABELS[task.recur].toLowerCase()}`
                  : "")
              : "Due date"
          }
          className={cn(
            "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition",
            task.due_at !== null
              ? overdue
                ? "text-red-500"
                : dueToday
                  ? "text-accent"
                  : "text-muted"
              : "text-muted opacity-0 hover:bg-elevated group-hover:opacity-100"
          )}
        >
          <CalendarDays size={13} />
          {task.due_at !== null && dueLabel(task.due_at, task.due_has_time)}
          {task.recur && <Repeat size={11} className="shrink-0" />}
        </button>
        <Popover open={menu === "due"} onClose={closeMenu} className="w-56">
          <DueMenu
            dueAt={task.due_at}
            hasTime={task.due_has_time}
            recur={task.recur}
            onChange={(dueAt, hasTime, recur, close) => {
              setDue(task.id, dueAt, hasTime, recur);
              if (close) closeMenu();
            }}
          />
        </Popover>
      </span>

      {/* priority */}
      <span className="relative shrink-0">
        <button
          onClick={() => openMenu("priority")}
          title={`Priority: ${priority.label}`}
          className={cn(
            "rounded-md p-1 transition",
            priority.cls,
            task.priority === 0 &&
              "opacity-0 hover:bg-elevated group-hover:opacity-100"
          )}
        >
          <Flag
            size={13}
            className={task.priority > 0 ? "fill-current" : ""}
          />
        </button>
        <Popover open={menu === "priority"} onClose={closeMenu} className="w-36">
          <PriorityMenu
            value={task.priority}
            onPick={(p) => {
              update(task.id, { priority: p });
              closeMenu();
            }}
          />
        </Popover>
      </span>

      {/* link to note */}
      <span className="relative shrink-0">
        <button
          onClick={() => openMenu("link")}
          title={linkedNote ? "Change linked note" : "Link to a note"}
          className={cn(
            "rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text",
            !linkedNote && "opacity-0 group-hover:opacity-100"
          )}
        >
          <Link2 size={13} />
        </button>
        <Popover open={menu === "link"} onClose={closeMenu} className="w-56">
          <input
            autoFocus
            value={noteQuery}
            onChange={(e) => setNoteQuery(e.target.value)}
            placeholder="Link to note…"
            className="mb-1 w-full rounded-lg bg-elevated/60 px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-muted"
          />
          {noteMatches.map((n) => (
            <MenuButton
              key={n.id}
              active={task.note_id === n.id}
              onClick={() => {
                update(task.id, { note_id: n.id });
                closeMenu();
              }}
            >
              <span className="text-[13px] leading-none">{n.icon}</span>
              <span className="truncate">{n.title || "Untitled"}</span>
            </MenuButton>
          ))}
          {noteMatches.length === 0 && (
            <div className="px-2.5 py-2 text-center text-xs text-muted">
              No matching notes
            </div>
          )}
          {task.note_id && (
            <>
              <div className="mx-2 my-1 border-t border-border" />
              <MenuButton
                onClick={() => {
                  update(task.id, { note_id: null });
                  closeMenu();
                }}
              >
                <span className="text-red-500">Unlink note</span>
              </MenuButton>
            </>
          )}
        </Popover>
      </span>

      <button
        onClick={() => remove(task.id)}
        className="shrink-0 text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
        title="Delete"
      >
        <X size={15} />
      </button>
    </div>
  );
}
