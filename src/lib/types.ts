export interface Note {
  id: string;
  title: string;
  content_json: string;
  body_text: string;
  icon: string;
  archived: number;
  pinned: number;
  created_at: number;
  updated_at: number;
}

/** Repeat presets a task can follow; completing rolls the due date forward. */
export type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export interface Task {
  id: string;
  title: string;
  /** Optional free-form details shown under the title. */
  description: string;
  done: number;
  due_at: number | null;
  /** 1 when due_at carries a time of day; 0 means an all-day due date (local midnight). */
  due_has_time: number;
  priority: number; // 0 none, 1 low, 2 med, 3 high
  note_id: string | null;
  position: number;
  /** 1 once a due notification has been delivered; reset when due_at changes. */
  notified: number;
  /** Repeat preset; null means one-off. Requires a due date, cleared with it. */
  recur: Recurrence | null;
  created_at: number;
}

export interface Sticky {
  id: string;
  content: string;
  color: string;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  pinned: number;
  created_at: number;
  updated_at: number;
}

/** Availability status a calendar day can be marked with. */
export type DayMarkKind = "busy" | "tentative" | "away";

export interface DayMark {
  /** Local yyyy-mm-dd; one mark per day, unmarked days are free. */
  day: string;
  kind: DayMarkKind;
  /** Optional short note shown on the day (e.g. "dentist"). */
  note: string;
  created_at: number;
}

/** Display name and tailwind classes for each mark kind. */
export const DAY_MARK_STYLES: Record<
  DayMarkKind,
  { label: string; dot: string; pill: string }
> = {
  busy: {
    label: "Busy",
    dot: "bg-red-500",
    pill: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  tentative: {
    label: "Tentative",
    dot: "bg-amber-500",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  away: {
    label: "Away",
    dot: "bg-sky-500",
    pill: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
};

export const DAY_MARK_KINDS = Object.keys(DAY_MARK_STYLES) as DayMarkKind[];

export interface SearchHit {
  note_id: string;
  title: string;
  snippet: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

/** A tag plus how many notes carry it (for the filter bar). */
export interface TagWithCount extends Tag {
  count: number;
}

/** Selectable tag colors. Key is stored in the DB; hex is used for rendering. */
export const TAG_COLORS: Record<string, string> = {
  gray: "#6b7280",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
};

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);

export const STICKY_COLORS: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#fef3a8", text: "#4a3f00" },
  pink: { bg: "#ffd4e5", text: "#5a1733" },
  blue: { bg: "#cfe8ff", text: "#0b3a5a" },
  green: { bg: "#d3f5d8", text: "#0e4023" },
  purple: { bg: "#e6dcff", text: "#33205a" },
  orange: { bg: "#ffe0c2", text: "#5a3110" },
};
