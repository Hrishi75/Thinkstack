import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Task } from "../lib/types";
import { tasksRepo } from "../lib/repo";
import { now } from "../lib/db";
import { debounce } from "../lib/util";
import { notify, reminderAt } from "../lib/notifications";

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

/** Attributes the composer can set on a task before it's created. */
export type NewTaskExtras = Partial<
  Pick<Task, "due_at" | "due_has_time" | "priority" | "note_id">
>;

interface TasksState {
  tasks: Task[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (title: string, extras?: NewTaskExtras) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Task>) => Promise<void>;
  /** Set/clear the due date (optionally with a time of day); re-arms the reminder unless it's already in the past. */
  setDue: (id: string, dueAt: number | null, hasTime?: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  clearCompleted: () => Promise<void>;
  /** Notify (once per task) about tasks whose reminder time has arrived. */
  notifyDue: () => Promise<void>;
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  loaded: false,

  async load() {
    set({ tasks: await tasksRepo.list(), loaded: true });
  },

  async add(title, extras) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const minPos = Math.min(0, ...get().tasks.map((t) => t.position));
    const due_at = extras?.due_at ?? null;
    const due_has_time = extras?.due_has_time ?? 0;
    const task: Task = {
      id: nanoid(),
      title: trimmed,
      done: 0,
      due_at,
      due_has_time,
      priority: extras?.priority ?? 0,
      note_id: extras?.note_id ?? null,
      position: minPos - 1,
      // Same rule as setDue: a reminder moment already in the past
      // shouldn't fire a pointless notification on the next tick.
      notified:
        due_at !== null && reminderAt(due_at, due_has_time) <= Date.now()
          ? 1
          : 0,
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

  async setDue(id, dueAt, hasTime = 0) {
    // If the reminder moment for the chosen day already passed (e.g. picking
    // "Today" in the afternoon), don't fire a pointless notification later.
    const notified =
      dueAt !== null && reminderAt(dueAt, hasTime) <= Date.now() ? 1 : 0;
    await get().update(id, { due_at: dueAt, due_has_time: hasTime, notified });
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

  async notifyDue() {
    const ts = Date.now();
    const due = get().tasks.filter(
      (t) =>
        !t.done &&
        !t.notified &&
        t.due_at !== null &&
        reminderAt(t.due_at, t.due_has_time) <= ts
    );
    if (!due.length) return;
    // Mark first so an overlapping timer tick can't double-notify.
    const ids = new Set(due.map((t) => t.id));
    set((s) => ({
      tasks: s.tasks.map((t) => (ids.has(t.id) ? { ...t, notified: 1 } : t)),
    }));
    await Promise.all(due.map((t) => tasksRepo.update(t.id, { notified: 1 })));
    const body =
      due
        .slice(0, 3)
        .map((t) => t.title)
        .join("\n") + (due.length > 3 ? `\n…and ${due.length - 3} more` : "");
    await notify(due.length === 1 ? "Task due" : `${due.length} tasks due`, body);
  },
}));
