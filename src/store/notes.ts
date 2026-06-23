import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Note } from "../lib/types";
import { notesRepo } from "../lib/repo";
import { now } from "../lib/db";

interface NotesState {
  notes: Note[];
  selectedId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  select: (id: string | null) => void;
  create: () => Promise<string>;
  saveContent: (
    id: string,
    patch: Partial<Pick<Note, "content_json" | "body_text" | "title" | "icon">>
  ) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
}

/** Stable sort: pinned first, then most-recently updated. */
function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => b.pinned - a.pinned || b.updated_at - a.updated_at
  );
}

export const useNotes = create<NotesState>((set, get) => ({
  notes: [],
  selectedId: null,
  loaded: false,

  async load() {
    const notes = await notesRepo.list();
    set({ notes, loaded: true });
    if (!get().selectedId && notes.length) set({ selectedId: notes[0].id });
  },

  select(id) {
    set({ selectedId: id });
  },

  async create() {
    const id = nanoid();
    const ts = now();
    const note: Note = {
      id,
      title: "Untitled",
      content_json: "",
      body_text: "",
      icon: "📄",
      archived: 0,
      pinned: 0,
      created_at: ts,
      updated_at: ts,
    };
    await notesRepo.create(note);
    set((s) => ({ notes: [note, ...s.notes], selectedId: id }));
    return id;
  },

  async saveContent(id, patch) {
    // optimistic local update + bump to top of recents
    set((s) => {
      const idx = s.notes.findIndex((n) => n.id === id);
      if (idx === -1) return s;
      const updated: Note = {
        ...s.notes[idx],
        ...patch,
        updated_at: now(),
      };
      const rest = s.notes.filter((n) => n.id !== id);
      return { notes: sortNotes([updated, ...rest]) };
    });
    await notesRepo.update(id, patch);
  },

  async togglePin(id) {
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const pinned = note.pinned ? 0 : 1;
    set((s) => ({
      notes: sortNotes(
        s.notes.map((n) => (n.id === id ? { ...n, pinned } : n))
      ),
    }));
    await notesRepo.setPinned(id, pinned);
  },

  async archive(id) {
    await notesRepo.archive(id);
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      const selectedId =
        s.selectedId === id ? notes[0]?.id ?? null : s.selectedId;
      return { notes, selectedId };
    });
  },
}));
