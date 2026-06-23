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

export const STICKY_COLORS: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#fef3a8", text: "#4a3f00" },
  pink: { bg: "#ffd4e5", text: "#5a1733" },
  blue: { bg: "#cfe8ff", text: "#0b3a5a" },
  green: { bg: "#d3f5d8", text: "#0e4023" },
  purple: { bg: "#e6dcff", text: "#33205a" },
  orange: { bg: "#ffe0c2", text: "#5a3110" },
};
