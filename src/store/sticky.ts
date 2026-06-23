import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Sticky } from "../lib/types";
import { stickyRepo } from "../lib/repo";
import { now } from "../lib/db";

const COLORS = ["yellow", "pink", "blue", "green", "purple", "orange"];

interface StickyState {
  stickies: Sticky[];
  loaded: boolean;
  load: () => Promise<void>;
  create: () => Promise<Sticky>;
  setColor: (id: string, color: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useSticky = create<StickyState>((set, get) => ({
  stickies: [],
  loaded: false,

  async load() {
    set({ stickies: await stickyRepo.list(), loaded: true });
  },

  async create() {
    const ts = now();
    const color = COLORS[get().stickies.length % COLORS.length];
    const s: Sticky = {
      id: nanoid(),
      content: "",
      color,
      x: null,
      y: null,
      width: 280,
      height: 280,
      pinned: 1,
      created_at: ts,
      updated_at: ts,
    };
    await stickyRepo.create(s);
    set((st) => ({ stickies: [s, ...st.stickies] }));
    return s;
  },

  async setColor(id, color) {
    set((st) => ({
      stickies: st.stickies.map((s) => (s.id === id ? { ...s, color } : s)),
    }));
    await stickyRepo.update(id, { color });
  },

  async remove(id) {
    set((st) => ({ stickies: st.stickies.filter((s) => s.id !== id) }));
    await stickyRepo.remove(id);
  },
}));
