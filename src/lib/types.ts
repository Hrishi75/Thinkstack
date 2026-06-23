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

export interface Task {
  id: string;
  title: string;
  done: number;
  due_at: number | null;
  priority: number; // 0 none, 1 low, 2 med, 3 high
  note_id: string | null;
  position: number;
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
