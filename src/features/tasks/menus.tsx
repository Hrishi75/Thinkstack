import { Bell, BellOff, Flag } from "lucide-react";
import { cn } from "../../lib/util";
import { reminderLabel } from "../../lib/notifications";
import {
  DAY,
  startOfToday,
  dayStart,
  dateInputToTs,
  toDateInput,
  toTimeInput,
  weekdayShort,
  monthDay,
} from "../../lib/dates";

export const PRIORITIES = [
  { value: 0, label: "None", cls: "text-muted" },
  { value: 1, label: "Low", cls: "text-sky-500" },
  { value: 2, label: "Medium", cls: "text-amber-500" },
  { value: 3, label: "High", cls: "text-red-500" },
];

/** Anchored dropdown with a click-away backdrop. Parent must be `relative`. */
export function Popover({
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

export function MenuButton({
  onClick,
  children,
  active,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    // Explicit type: inside the composer <form> a bare <button> would
    // default to type="submit" and create the task on any menu click.
    <button
      type="button"
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

/**
 * Contents of the due-date menu: quick picks, custom date & time, remove.
 * Quick picks and remove report close=true; the date/time inputs keep the
 * menu open so both can be adjusted before dismissing.
 */
export function DueMenu({
  dueAt,
  hasTime,
  onChange,
}: {
  dueAt: number | null;
  hasTime: number;
  onChange: (dueAt: number | null, hasTime: number, close: boolean) => void;
}) {
  const today = startOfToday();

  // Change the due day, carrying any chosen time of day along.
  const applyDay = (day: number, close: boolean) => {
    if (dueAt !== null && hasTime)
      onChange(day + (dueAt - dayStart(dueAt)), 1, close);
    else onChange(day, 0, close);
  };
  // Set or clear the time of day; an empty value returns to all-day.
  const pickTime = (value: string) => {
    const base = dueAt !== null ? dayStart(dueAt) : today;
    if (!value) return onChange(base, 0, false);
    const [h, m] = value.split(":").map(Number);
    onChange(base + (h * 60 + m) * 60_000, 1, false);
  };

  return (
    <>
      <MenuButton onClick={() => applyDay(today, true)}>
        <span className="flex-1">Today</span>
        <span className="text-[11px] text-muted">{weekdayShort(today)}</span>
      </MenuButton>
      <MenuButton onClick={() => applyDay(today + DAY, true)}>
        <span className="flex-1">Tomorrow</span>
        <span className="text-[11px] text-muted">{weekdayShort(today + DAY)}</span>
      </MenuButton>
      <MenuButton onClick={() => applyDay(today + 7 * DAY, true)}>
        <span className="flex-1">Next week</span>
        <span className="text-[11px] text-muted">{monthDay(today + 7 * DAY)}</span>
      </MenuButton>
      <div className="mx-2 my-1 border-t border-border" />
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="w-8 shrink-0 text-[11px] text-muted">Date</span>
        <input
          type="date"
          aria-label="Due date"
          value={dueAt !== null ? toDateInput(dueAt) : ""}
          onChange={(e) => {
            const ts = dateInputToTs(e.target.value);
            if (ts !== null) applyDay(ts, false);
          }}
          className="flex-1 rounded-lg bg-elevated/60 px-2 py-1 text-[12.5px] text-text outline-none"
        />
      </div>
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="w-8 shrink-0 text-[11px] text-muted">Time</span>
        <input
          type="time"
          aria-label="Due time"
          value={dueAt !== null && hasTime ? toTimeInput(dueAt) : ""}
          onChange={(e) => pickTime(e.target.value)}
          className="flex-1 rounded-lg bg-elevated/60 px-2 py-1 text-[12.5px] text-text outline-none"
        />
      </div>
      {dueAt !== null && (
        <>
          <ReminderHint dueAt={dueAt} hasTime={hasTime} />
          <div className="mx-2 my-1 border-t border-border" />
          <MenuButton onClick={() => onChange(null, 0, true)}>
            <span className="text-red-500">Remove due date</span>
          </MenuButton>
        </>
      )}
    </>
  );
}

/** One-line note on when (or whether) the reminder notification will fire. */
export function ReminderHint({
  dueAt,
  hasTime,
  className,
}: {
  dueAt: number;
  hasTime: number;
  className?: string;
}) {
  const label = reminderLabel(dueAt, hasTime);
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] text-muted",
        className
      )}
    >
      {label ? (
        <>
          <Bell size={11} className="shrink-0" />
          <span>Reminds {label}</span>
        </>
      ) : (
        <>
          <BellOff size={11} className="shrink-0" />
          <span>No reminder — that time already passed</span>
        </>
      )}
    </div>
  );
}

/** Contents of the priority menu. */
export function PriorityMenu({
  value,
  onPick,
}: {
  value: number;
  onPick: (priority: number) => void;
}) {
  return (
    <>
      {PRIORITIES.map((p) => (
        <MenuButton
          key={p.value}
          active={value === p.value}
          onClick={() => onPick(p.value)}
        >
          <Flag size={13} className={cn(p.cls, p.value > 0 && "fill-current")} />
          {p.label}
        </MenuButton>
      ))}
    </>
  );
}
