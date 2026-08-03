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

/** Buckets a memory can be filed under; purely for grouping and filtering. */
export type MemoryCategory =
  | "company"
  | "product"
  | "people"
  | "projects"
  | "style"
  | "general";

/**
 * A standing fact the AI should know without being told again — company
 * background, who's who, house writing style. Enabled memories are prepended
 * to the system prompt of every AI request.
 */
export interface Memory {
  id: string;
  /** Short label; doubles as the heading the model sees. */
  title: string;
  content: string;
  category: MemoryCategory;
  /** 0 keeps the memory but leaves it out of the AI context. */
  enabled: number;
  created_at: number;
  updated_at: number;
}

export const MEMORY_CATEGORIES: Record<
  MemoryCategory,
  { label: string; pill: string }
> = {
  company: {
    label: "Company",
    pill: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  product: {
    label: "Product",
    pill: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  people: {
    label: "People",
    pill: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  projects: {
    label: "Projects",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  style: {
    label: "Style & tone",
    pill: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  },
  general: {
    label: "General",
    pill: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  },
};

export const MEMORY_CATEGORY_KEYS = Object.keys(
  MEMORY_CATEGORIES
) as MemoryCategory[];

/** Coerce a stored category string to a known one. */
export function toMemoryCategory(raw: string): MemoryCategory {
  return (MEMORY_CATEGORY_KEYS as string[]).includes(raw)
    ? (raw as MemoryCategory)
    : "general";
}

/** Lifecycle of an orchestration worker. The process is never resumed across
 * app restarts, so `running` rows are reconciled to `stopped` on load.
 *
 * `queued` is the one status with no process and no worktree behind it: the
 * worker is waiting for the worker named in `depends_on` to be approved. */
export type WorkerStatus =
  | "queued"
  | "running"
  | "review"
  | "approved"
  | "failed"
  | "stopped";

export interface Worker {
  id: string;
  repo_path: string;
  repo_label: string;
  source_kind: "issue" | "pr";
  source_number: number | null;
  title: string;
  prompt: string;
  branch: string;
  /** Empty until a queued worker is promoted and its worktree is created. */
  worktree_path: string;
  /** Commit the worktree branched from; diffs are computed against it. */
  base_sha: string;
  /** Id of the worker this one waits on, or "" to start immediately. */
  depends_on: string;
  status: WorkerStatus;
  error: string;
  /** Claude Code session id, for `claude --resume`. */
  session_id: string;
  cost_usd: number;
  pr_url: string;
  created_at: number;
  updated_at: number;
}

export const WORKER_STATUS_STYLES: Record<
  WorkerStatus,
  { label: string; dot: string; pill: string }
> = {
  queued: {
    label: "Queued",
    dot: "bg-violet-500",
    pill: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  running: {
    label: "Running",
    dot: "bg-sky-500",
    pill: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  review: {
    label: "Needs review",
    dot: "bg-amber-500",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  approved: {
    label: "Approved",
    dot: "bg-green-500",
    pill: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    dot: "bg-red-500",
    pill: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  stopped: {
    label: "Stopped",
    dot: "bg-slate-400",
    pill: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  },
};

/** An open GitHub issue or PR available to hand to a worker. */
export interface WorkItem {
  kind: "issue" | "pr";
  number: number;
  title: string;
  labels: string[];
  updated_at: string;
  url: string;
  /** Source branch of a PR; empty for issues. */
  head_ref: string;
}

/* ------------------------------ Board ------------------------------ */

/** Columns of the unified board, in display order. */
export type BoardStage = "backlog" | "todo" | "doing" | "done";

/** Domains that contribute cards to the board. */
export type BoardKind = "task" | "note" | "sticky" | "worker";

export const BOARD_STAGES: {
  key: BoardStage;
  label: string;
  dot: string;
}[] = [
  { key: "backlog", label: "Backlog", dot: "bg-slate-400" },
  { key: "todo", label: "To do", dot: "bg-sky-500" },
  { key: "doing", label: "In progress", dot: "bg-amber-500" },
  { key: "done", label: "Done", dot: "bg-green-500" },
];

export const BOARD_STAGE_KEYS = BOARD_STAGES.map((s) => s.key);

export const BOARD_KINDS: { key: BoardKind; label: string }[] = [
  { key: "task", label: "Tasks" },
  { key: "note", label: "Notes" },
  { key: "sticky", label: "Sticky" },
  { key: "worker", label: "Workers" },
];

/** Coerce a stored stage string to a known one. */
export function toBoardStage(raw: string): BoardStage {
  return (BOARD_STAGE_KEYS as string[]).includes(raw)
    ? (raw as BoardStage)
    : "backlog";
}

/**
 * Where the user dragged one item. Rows exist only for items that have been
 * placed by hand; everything else takes a stage derived from its own state.
 */
export interface BoardPlacement {
  kind: BoardKind;
  item_id: string;
  stage: BoardStage;
  position: number;
  updated_at: number;
}

/* -------------------------- Notifications -------------------------- */

/**
 * What a notification is about; picks its icon and tint. Widening this list
 * needs no migration — `kind` is plain TEXT — but every value must appear in
 * NOTIFICATION_TONES, which is what `toNotificationKind` validates against.
 */
export type NotificationKind =
  | "task_due"
  | "task_scheduled"
  | "note"
  | "ai"
  | "worker_review"
  | "worker_done"
  | "worker_failed"
  | "system"
  | "error";

/**
 * One entry in the in-app feed. Unlike a desktop banner it sticks around
 * until the user reads or clears it, and it remembers what to open.
 */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** Stable id of the event behind it; recorded at most once. */
  event_key: string;
  title: string;
  body: string;
  /** Item to open on click; "" when there's nothing to go to. */
  link_kind: BoardKind | "";
  link_id: string;
  read: number;
  created_at: number;
}

export const NOTIFICATION_TONES: Record<NotificationKind, string> = {
  task_due: "text-sky-500",
  task_scheduled: "text-slate-500",
  note: "text-slate-500",
  ai: "text-purple-500",
  worker_review: "text-amber-500",
  worker_done: "text-green-500",
  worker_failed: "text-red-500",
  system: "text-slate-500",
  error: "text-red-500",
};

export const NOTIFICATION_KINDS = Object.keys(
  NOTIFICATION_TONES
) as NotificationKind[];

/** Coerce a stored kind string to a known one. */
export function toNotificationKind(raw: string): NotificationKind {
  return (NOTIFICATION_KINDS as string[]).includes(raw)
    ? (raw as NotificationKind)
    : "system";
}

/** Coerce a stored link kind to a known one; "" means nothing to open. */
export function toLinkKind(raw: string): BoardKind | "" {
  return BOARD_KINDS.some((k) => k.key === raw) ? (raw as BoardKind) : "";
}

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
