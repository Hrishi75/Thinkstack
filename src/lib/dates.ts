import type { Recurrence } from "./types";

export const DAY = 86_400_000;

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of the day containing ts. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-midnight timestamp for a yyyy-mm-dd date input value. */
export function dateInputToTs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Local yyyy-mm-dd for a date input value. */
export function toDateInput(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Local HH:MM for a time input value. */
export function toTimeInput(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jul 9 · 2:30 PM" (with the year when it differs) for created-at stamps. */
export function dateTimeLabel(ts: number): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
  return `${date} · ${formatTime(ts)}`;
}

export function weekdayShort(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
}

export function monthDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * "Today" / "Tomorrow" / "Yesterday", a weekday within the next week,
 * otherwise "Mar 5" (with year when it differs) — plus the time when set.
 */
export function dueLabel(ts: number, hasTime: number): string {
  const diff = Math.round((dayStart(ts) - startOfToday()) / DAY);
  let day: string;
  if (diff === 0) day = "Today";
  else if (diff === 1) day = "Tomorrow";
  else if (diff === -1) day = "Yesterday";
  else if (diff > 1 && diff < 7) day = weekdayShort(ts);
  else if (new Date(ts).getFullYear() === new Date().getFullYear())
    day = monthDay(ts);
  else
    day = new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return hasTime ? `${day} · ${formatTime(ts)}` : day;
}

/**
 * One recurrence step forward from ts, preserving the wall-clock time.
 * Month/year steps clamp to the last day of the target month
 * (Jan 31 → Feb 28/29); weekday steps skip Saturday and Sunday.
 */
export function addRecurStep(ts: number, recur: Recurrence): number {
  const d = new Date(ts);
  switch (recur) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekdays":
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
    case "yearly": {
      const day = d.getDate();
      d.setDate(1);
      if (recur === "monthly") d.setMonth(d.getMonth() + 1);
      else d.setFullYear(d.getFullYear() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      break;
    }
  }
  return d.getTime();
}

/**
 * Next occurrence after completing a task due at dueAt: step from the
 * original due date, advancing until strictly in the future — past now for
 * timed tasks, past today for all-day ones (never lands on today, since
 * today's instance is the one just completed).
 */
export function nextOccurrence(
  dueAt: number,
  recur: Recurrence,
  hasTime: number,
  nowTs = Date.now()
): number {
  const floor = hasTime ? nowTs : dayStart(nowTs);
  let next = addRecurStep(dueAt, recur);
  while (next <= floor) next = addRecurStep(next, recur);
  return next;
}

/** Full "Friday, July 10 · 2:30 PM" for tooltips. */
export function dueTooltip(ts: number, hasTime: number): string {
  const day = new Date(ts).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return hasTime ? `${day} · ${formatTime(ts)}` : day;
}
