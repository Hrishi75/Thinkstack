import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Note, Tag, TagWithCount } from "../lib/types";
import { TAG_COLOR_KEYS } from "../lib/types";
import { notesRepo, tagsRepo } from "../lib/repo";
import { now } from "../lib/db";

interface NotesState {
  notes: Note[];
  selectedId: string | null;
  loaded: boolean;
  /** All tags with note counts, for the filter bar. */
  tags: TagWithCount[];
  /** noteId → tags attached to it. */
  noteTags: Record<string, Tag[]>;
  /** Tag currently filtering the list, or null for "all". */
  activeTagId: string | null;
  load: () => Promise<void>;
  loadTags: () => Promise<void>;
  select: (id: string | null) => void;
  create: () => Promise<string>;
  saveContent: (
    id: string,
    patch: Partial<Pick<Note, "content_json" | "body_text" | "title" | "icon">>
  ) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  setActiveTag: (id: string | null) => void;
  addTag: (noteId: string, name: string) => Promise<void>;
  removeTag: (noteId: string, tagId: string) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
}

/** Stable sort: pinned first, then most-recently updated. */
function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => b.pinned - a.pinned || b.updated_at - a.updated_at
  );
}

/** Deterministic color for a tag name, so the same name always looks the same. */
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLOR_KEYS[h % TAG_COLOR_KEYS.length];
}

export const useNotes = create<NotesState>((set, get) => ({
  notes: [],
  selectedId: null,
  loaded: false,
  tags: [],
  noteTags: {},
  activeTagId: null,

  async load() {
    const notes = await notesRepo.list();
    set({ notes, loaded: true });
    if (!get().selectedId && notes.length) set({ selectedId: notes[0].id });
    await get().loadTags();
  },

  async loadTags() {
    const [tags, links] = await Promise.all([tagsRepo.list(), tagsRepo.links()]);
    const noteTags: Record<string, Tag[]> = {};
    for (const row of links) {
      const tag: Tag = {
        id: row.id,
        name: row.name,
        color: row.color,
        created_at: row.created_at,
      };
      (noteTags[row.note_id] ??= []).push(tag);
    }
    set({ tags, noteTags });
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

  setActiveTag(id) {
    set((s) => ({ activeTagId: s.activeTagId === id ? null : id }));
  },

  async addTag(noteId, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = await tagsRepo.ensure(trimmed, colorForName(trimmed));
    await tagsRepo.attach(noteId, tag.id);
    await get().loadTags();
  },

  async removeTag(noteId, tagId) {
    await tagsRepo.detach(noteId, tagId);
    await get().loadTags();
  },

  async deleteTag(tagId) {
    await tagsRepo.remove(tagId);
    set((s) => ({
      activeTagId: s.activeTagId === tagId ? null : s.activeTagId,
    }));
    await get().loadTags();
  },
}));
