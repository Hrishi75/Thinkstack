import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  Flag,
  X,
  CalendarDays,
  Link2,
} from "lucide-react";
import { useTasks } from "../../store/tasks";
import { useNotes } from "../../store/notes";
import { useUI } from "../../store/ui";
import type { Task } from "../../lib/types";
import { cn } from "../../lib/util";

const PRIORITIES = [
  { value: 0, label: "None", cls: "text-muted" },
  { value: 1, label: "Low", cls: "text-sky-500" },
  { value: 2, label: "Medium", cls: "text-amber-500" },
  { value: 3, label: "High", cls: "text-red-500" },
];

const DAY = 86_400_000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-midnight timestamp for a yyyy-mm-dd date input value. */
function dateInputToTs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function dueLabel(ts: number): string {
  const diff = Math.round((ts - startOfToday()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Anchored dropdown with a click-away backdrop. Parent must be `relative`. */
function Popover({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={cn(
          "absolute right-0 top-7 z-30 rounded-xl border border-border bg-surface p-1 shadow-pop",
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

function MenuButton({
  onClick,
  children,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-elevated",
        active && "bg-accent/10 text-accent"
      )}
    >
      {children}
    </button>
  );
}

export default function TaskItem({ task }: { task: Task }) {
  const toggle = useTasks((s) => s.toggle);
  const update = useTasks((s) => s.update);
  const setDue = useTasks((s) => s.setDue);
  const remove = useTasks((s) => s.remove);
  const notes = useNotes((s) => s.notes);
  const selectNote = useNotes((s) => s.select);
  const setView = useUI((s) => s.setView);

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
  const overdue = task.due_at !== null && !task.done && task.due_at < today;
  const dueToday = task.due_at !== null && !task.done && task.due_at === today;
  const priority = PRIORITIES[task.priority] ?? PRIORITIES[0];

  const closeMenu = () => {
    setMenu(null);
    setNoteQuery("");
  };
  const openMenu = (m: "due" | "priority" | "link") =>
    setMenu((cur) => (cur === m ? null : m));

  const pickDue = (ts: number | null) => {
    setDue(task.id, ts);
    closeMenu();
  };

  const goToNote = () => {
    if (!linkedNote) return;
    selectNote(linkedNote.id);
    setView("notes");
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
        onClick={() => toggle(task.id)}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150",
          task.done
            ? "border-accent bg-accent text-white"
            : "border-border hover:scale-105 hover:border-accent"
        )}
      >
        {task.done ? <Check size={13} strokeWidth={3} /> : null}
      </button>

      <input
        value={task.title}
        onChange={(e) => update(task.id, { title: e.target.value })}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm outline-none transition-colors duration-200",
          !!task.done && "text-muted line-through"
        )}
      />

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
          title="Due date"
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
          {task.due_at !== null && dueLabel(task.due_at)}
        </button>
        <Popover open={menu === "due"} onClose={closeMenu} className="w-44">
          <MenuButton onClick={() => pickDue(today)}>Today</MenuButton>
          <MenuButton onClick={() => pickDue(today + DAY)}>Tomorrow</MenuButton>
          <MenuButton onClick={() => pickDue(today + 7 * DAY)}>
            Next week
          </MenuButton>
          <div className="mx-2 my-1 border-t border-border" />
          <div className="px-1 py-1">
            <input
              type="date"
              aria-label="Pick a due date"
              onChange={(e) => {
                const ts = dateInputToTs(e.target.value);
                if (ts !== null) pickDue(ts);
              }}
              className="w-full rounded-lg bg-elevated/60 px-2 py-1 text-[12.5px] text-text outline-none"
            />
          </div>
          {task.due_at !== null && (
            <>
              <div className="mx-2 my-1 border-t border-border" />
              <MenuButton onClick={() => pickDue(null)}>
                <span className="text-red-500">Remove due date</span>
              </MenuButton>
            </>
          )}
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
          {PRIORITIES.map((p) => (
            <MenuButton
              key={p.value}
              active={task.priority === p.value}
              onClick={() => {
                update(task.id, { priority: p.value });
                closeMenu();
              }}
            >
              <Flag
                size={13}
                className={cn(p.cls, p.value > 0 && "fill-current")}
              />
              {p.label}
            </MenuButton>
          ))}
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
