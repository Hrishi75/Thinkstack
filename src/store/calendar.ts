import { create } from "zustand";
import type { DayMark, DayMarkKind } from "../lib/types";
import { dayMarksRepo } from "../lib/repo";
import { now } from "../lib/db";

interface CalendarState {
  /** Marks keyed by local yyyy-mm-dd. */
  marks: Record<string, DayMark>;
  loaded: boolean;
  load: () => Promise<void>;
  /** Set the day's status, keeping any note already on it. */
  setMark: (day: string, kind: DayMarkKind) => Promise<void>;
  /** Set the day's note; marks the day busy if it isn't marked yet. */
  setNote: (day: string, note: string) => Promise<void>;
  clearMark: (day: string) => Promise<void>;
}

export const useCalendar = create<CalendarState>((set, get) => ({
  marks: {},
  loaded: false,

  async load() {
    const rows = await dayMarksRepo.list();
    set({
      marks: Object.fromEntries(rows.map((m) => [m.day, m])),
      loaded: true,
    });
  },

  async setMark(day, kind) {
    const existing = get().marks[day];
    const mark: DayMark = {
      day,
      kind,
      note: existing?.note ?? "",
      created_at: existing?.created_at ?? now(),
    };
    set((s) => ({ marks: { ...s.marks, [day]: mark } }));
    await dayMarksRepo.upsert(mark);
  },

  async setNote(day, note) {
    const existing = get().marks[day];
    const trimmed = note.trim();
    // Typing a note on an unmarked day shouldn't be lost — default it to busy.
    const mark: DayMark = existing
      ? { ...existing, note: trimmed }
      : { day, kind: "busy", note: trimmed, created_at: now() };
    set((s) => ({ marks: { ...s.marks, [day]: mark } }));
    await dayMarksRepo.upsert(mark);
  },

  async clearMark(day) {
    set((s) => {
      const marks = { ...s.marks };
      delete marks[day];
      return { marks };
    });
    await dayMarksRepo.remove(day);
  },
}));
