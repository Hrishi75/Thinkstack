import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Recurrence, Task } from "../lib/types";
import { tasksRepo } from "../lib/repo";
import { now } from "../lib/db";
import { dueLabel, nextOccurrence } from "../lib/dates";
import { debounce } from "../lib/util";
import { notify, reminderAt } from "../lib/notifications";
import { announce } from "./notifications";

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
  Pick<
    Task,
    "description" | "due_at" | "due_has_time" | "priority" | "note_id" | "recur"
  >
>;

interface TasksState {
  tasks: Task[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Returns the new task's id, or "" when the title was blank. */
  add: (title: string, extras?: NewTaskExtras) => Promise<string>;
  toggle: (id: string) => Promise<void>;
  update: (id: string, patch: Partial<Task>) => Promise<void>;
  /**
   * Set/clear the due date (optionally with a time of day and a repeat
   * preset); re-arms the reminder unless it's already in the past. Omitting
   * recur leaves it untouched; clearing the date always clears the repeat.
   */
  setDue: (
    id: string,
    dueAt: number | null,
    hasTime?: number,
    recur?: Recurrence | null
  ) => Promise<void>;
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
    if (!trimmed) return "";
    const minPos = Math.min(0, ...get().tasks.map((t) => t.position));
    const due_at = extras?.due_at ?? null;
    const due_has_time = extras?.due_has_time ?? 0;
    const task: Task = {
      id: nanoid(),
      title: trimmed,
      description: extras?.description?.trim() ?? "",
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
      // A repeat only makes sense with a due date to roll forward from.
      recur: due_at !== null ? extras?.recur ?? null : null,
      created_at: now(),
    };
    await tasksRepo.create(task);
    set((s) => ({ tasks: [task, ...s.tasks] }));
    return task.id;
  },

  async toggle(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    // Completing a repeating task rolls its due date to the next occurrence
    // instead of marking it done; the reminder re-arms via the reset flag.
    if (!task.done && task.recur && task.due_at !== null) {
      const due_at = nextOccurrence(task.due_at, task.recur, task.due_has_time);
      const notified =
        reminderAt(due_at, task.due_has_time) <= Date.now() ? 1 : 0;
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, due_at, notified } : t)),
      }));
      await tasksRepo.update(id, { due_at, notified });
      return;
    }
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

  async setDue(id, dueAt, hasTime = 0, recur) {
    // If the reminder moment for the chosen day already passed (e.g. picking
    // "Today" in the afternoon), don't fire a pointless notification later.
    const notified =
      dueAt !== null && reminderAt(dueAt, hasTime) <= Date.now() ? 1 : 0;
    const patch: Partial<Task> = { due_at: dueAt, due_has_time: hasTime, notified };
    if (dueAt === null) patch.recur = null;
    else if (recur !== undefined) patch.recur = recur;
    await get().update(id, patch);
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
    // One desktop banner summarizes the batch; the feed keeps an entry per
    // task so each can be opened and dismissed on its own once it's gone.
    await Promise.all(
      due.map((t) =>
        announce({
          kind: "task_due",
          // Keyed by the due moment, so rescheduling the task notifies again
          // but the once-a-minute sweep never repeats itself.
          eventKey: `task-due:${t.id}:${t.due_at}`,
          title: t.title || "Untitled task",
          body: t.due_at === null ? "" : `Due ${dueLabel(t.due_at, t.due_has_time)}`,
          link: { kind: "task", id: t.id },
        })
      )
    );

    const body =
      due
        .slice(0, 3)
        .map((t) => t.title)
        .join("\n") + (due.length > 3 ? `\n…and ${due.length - 3} more` : "");
    await notify(due.length === 1 ? "Task due" : `${due.length} tasks due`, body);
  },
}));
