import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTasks } from "../../store/tasks";
import { useCalendar } from "../../store/calendar";
import { cn } from "../../lib/util";
import { toDateInput, formatTime } from "../../lib/dates";
import {
  DAY_MARK_KINDS,
  DAY_MARK_STYLES,
  type DayMarkKind,
  type Task,
} from "../../lib/types";

// Weekday header labels, Sunday-first, in the user's locale
// (2023-01-01 was a Sunday).
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" })
);

/** The 42 days (6 weeks, Sunday-start) covering the given month. */
function monthGrid(year: number, month: number): Date[] {
  const lead = new Date(year, month, 1).getDay();
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, 1 - lead + i)
  );
}

/** Popover for one day: pick a status, jot a note, see what's due. */
function DayMenu({
  day,
  date,
  tasks,
  onClose,
  flipX,
  flipY,
}: {
  day: string;
  date: Date;
  tasks: Task[];
  onClose: () => void;
  flipX: boolean;
  flipY: boolean;
}) {
  const mark = useCalendar((s) => s.marks[day]);
  const setMark = useCalendar((s) => s.setMark);
  const setNote = useCalendar((s) => s.setNote);
  const clearMark = useCalendar((s) => s.clearMark);
  const [note, setNoteDraft] = useState(mark?.note ?? "");

  const saveNote = () => {
    const trimmed = note.trim();
    if (trimmed === (mark?.note ?? "")) return;
    if (trimmed || mark) setNote(day, trimmed);
  };

  return (
    <>
      {/* Stop propagation so the click-away doesn't re-trigger the cell's
          open handler underneath. */}
      <div
        className="fixed inset-0 z-20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className={cn(
          "absolute z-30 w-56 rounded-xl border border-border bg-surface p-2 shadow-pop",
          flipX ? "right-1" : "left-1",
          flipY ? "bottom-full mb-1" : "top-full mt-1"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-1 pb-1.5 text-[12px] font-medium text-muted">
          {date.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </div>

        <div className="flex gap-1">
          {DAY_MARK_KINDS.map((kind) => {
            const style = DAY_MARK_STYLES[kind];
            const active = mark?.kind === kind;
            return (
              <button
                key={kind}
                onClick={() => (active ? clearMark(day) : setMark(day, kind))}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-[12px] transition",
                  active
                    ? cn("font-medium", style.pill)
                    : "text-muted hover:bg-elevated hover:text-text"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                {style.label}
              </button>
            );
          })}
        </div>

        <input
          value={note}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              saveNote();
              onClose();
            }
          }}
          placeholder="Add a note…"
          className="mt-1.5 w-full rounded-lg border border-border/80 bg-bg px-2 py-1.5 text-[12.5px] text-text outline-none placeholder:text-muted/70 focus:border-accent/50"
        />

        {tasks.length > 0 && (
          <div className="mt-1.5 border-t border-border/60 pt-1.5">
            <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted/80">
              Due
            </div>
            {tasks.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1.5 px-1 py-0.5 text-[12px] text-text"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="flex-1 truncate">{t.title}</span>
                {t.due_has_time === 1 && t.due_at !== null && (
                  <span className="shrink-0 text-[11px] text-muted">
                    {formatTime(t.due_at)}
                  </span>
                )}
              </div>
            ))}
            {tasks.length > 4 && (
              <div className="px-1 pt-0.5 text-[11px] text-muted">
                …and {tasks.length - 4} more
              </div>
            )}
          </div>
        )}

        {mark && (
          <button
            onClick={() => {
              clearMark(day);
              onClose();
            }}
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] text-muted transition hover:bg-elevated hover:text-red-500"
          >
            <X size={12} /> Clear mark
          </button>
        )}
      </div>
    </>
  );
}

export default function CalendarView() {
  const marks = useCalendar((s) => s.marks);
  const allTasks = useTasks((s) => s.tasks);

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const today = toDateInput(Date.now());

  // Open tasks grouped by local due day for the dots and the day menu.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (t.done || t.due_at === null) continue;
      const key = toDateInput(t.due_at);
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [allTasks]);

  const move = (delta: number) => {
    setOpenDay(null);
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const goToday = () => {
    setOpenDay(null);
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" }
  );

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center px-6" />
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col overflow-hidden px-6 pb-6">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{monthLabel}</h2>
            <span className="hidden text-[13px] text-muted sm:inline">
              Click a day to mark it
            </span>
          </div>
          <div className="no-drag flex items-center gap-1">
            <button
              onClick={goToday}
              className="rounded-md px-2.5 py-1 text-[12.5px] text-muted transition hover:bg-elevated hover:text-text"
            >
              Today
            </button>
            <button
              onClick={() => move(-1)}
              className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
              title="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => move(1)}
              className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
              title="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 pb-1">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted/80"
            >
              {w}
            </div>
          ))}
        </div>

        {/* No overflow-hidden here — day popovers must escape the grid; the
            four corner cells are rounded instead so the frame still clips. */}
        <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px rounded-xl border border-border/70 bg-border/40">
          {days.map((date, i) => {
            const day = toDateInput(date.getTime());
            const inMonth = date.getMonth() === cursor.m;
            const isToday = day === today;
            const mark = marks[day];
            const style = mark ? DAY_MARK_STYLES[mark.kind] : null;
            const due = tasksByDay.get(day) ?? [];
            return (
              <div
                key={day}
                onClick={() => inMonth && setOpenDay(day)}
                className={cn(
                  "relative flex min-h-0 flex-col gap-1 p-1.5",
                  inMonth
                    ? "cursor-pointer bg-bg transition hover:bg-elevated/50"
                    : "bg-bg/50",
                  i === 0 && "rounded-tl-[11px]",
                  i === 6 && "rounded-tr-[11px]",
                  i === 35 && "rounded-bl-[11px]",
                  i === 41 && "rounded-br-[11px]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[12px] tabular-nums",
                      isToday
                        ? "bg-accent font-semibold text-white"
                        : inMonth
                          ? "text-text"
                          : "text-muted/50"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {style && (
                    <span
                      className={cn("h-2 w-2 rounded-full", style.dot)}
                      title={style.label}
                    />
                  )}
                </div>

                {inMonth && style && mark && (
                  <span
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[10.5px] font-medium leading-tight",
                      style.pill
                    )}
                    title={mark.note || style.label}
                  >
                    {mark.note || style.label}
                  </span>
                )}

                {inMonth && due.length > 0 && (
                  <div
                    className="mt-auto flex items-center gap-0.5"
                    title={due.map((t) => t.title).join("\n")}
                  >
                    {due.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className="h-1.5 w-1.5 rounded-full bg-accent"
                      />
                    ))}
                    {due.length > 3 && (
                      <span className="text-[10px] tabular-nums text-muted">
                        +{due.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {openDay === day && (
                  <DayMenu
                    day={day}
                    date={date}
                    tasks={due}
                    onClose={() => setOpenDay(null)}
                    flipX={i % 7 >= 4}
                    flipY={Math.floor(i / 7) >= 3}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 pt-2.5">
          {DAY_MARK_KINDS.map((kind: DayMarkKind) => (
            <span
              key={kind}
              className="flex items-center gap-1.5 text-[11.5px] text-muted"
            >
              <span
                className={cn("h-2 w-2 rounded-full", DAY_MARK_STYLES[kind].dot)}
              />
              {DAY_MARK_STYLES[kind].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Task due
          </span>
        </div>
      </div>
    </div>
  );
}
