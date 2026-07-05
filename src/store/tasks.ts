import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Task } from "../lib/types";
import { tasksRepo } from "../lib/repo";
import { now } from "../lib/db";
import { debounce } from "../lib/util";

// Title edits arrive one keystroke at a time; batch the DB write per task so
// typing stays smooth while the in-memory state updates instantly.
const titleWriters = new Map<
  string,
  ((title: string) => void) & { flush: () => void }
>();

function writeTitleDebounced(id: string, title: string) {
  let writer = titleWriters.get(id);
  if (!writer) {
    writer = debounce((value: string) => {
      tasksRepo.update(id, { title: value });
    }, 350);
    titleWriters.set(id, writer);
  }
  writer(title);
}

interface TasksState {
  tasks: Task[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (title: string) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Task>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  clearCompleted: () => Promise<void>;
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  loaded: false,

  async load() {
    set({ tasks: await tasksRepo.list(), loaded: true });
  },

  async add(title) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const minPos = Math.min(0, ...get().tasks.map((t) => t.position));
    const task: Task = {
      id: nanoid(),
      title: trimmed,
      done: 0,
      due_at: null,
      priority: 0,
      note_id: null,
      position: minPos - 1,
      created_at: now(),
    };
    await tasksRepo.create(task);
    set((s) => ({ tasks: [task, ...s.tasks] }));
  },

  async toggle(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const done = task.done ? 0 : 1;
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, done } : t)),
    }));
    await tasksRepo.update(id, { done });
  },

  async update(id, patch) {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
    const keys = Object.keys(patch);
    if (keys.length === 1 && keys[0] === "title") {
      writeTitleDebounced(id, patch.title as string);
      return;
    }
    // A mixed patch must not race a pending title write.
    titleWriters.get(id)?.flush();
    await tasksRepo.update(id, patch);
  },

  async remove(id) {
    titleWriters.delete(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    await tasksRepo.remove(id);
  },

  async reorder(ids) {
    // assign ascending positions following the new visual order
    set((s) => {
      const byId = new Map(s.tasks.map((t) => [t.id, t]));
      const reordered = ids
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, position: i } : null;
        })
        .filter(Boolean) as Task[];
      return { tasks: reordered };
    });
    await Promise.all(ids.map((id, i) => tasksRepo.update(id, { position: i })));
  },

  async clearCompleted() {
    const done = get().tasks.filter((t) => t.done);
    if (!done.length) return;
    set((s) => ({ tasks: s.tasks.filter((t) => !t.done) }));
    await Promise.all(done.map((t) => tasksRepo.remove(t.id)));
  },
}));
