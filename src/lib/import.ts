/**
 * Reading a JSON export back in.
 *
 * Import is **additive and non-destructive**: a record whose id is already here
 * is left exactly as it is, never overwritten. That makes running the same file
 * twice harmless, and means an import can never quietly replace something you
 * changed since the export was taken. The cost is that it cannot be used to
 * roll back — that's what the database backup is for.
 *
 * It runs in two steps on purpose. `planImport` reads and validates the file
 * and reports what *would* happen; nothing is written until `applyImport` is
 * called with that plan.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { EXPORT_FORMAT } from "./export";
import {
  dayMarksRepo,
  importRepo,
  memoriesRepo,
  notesRepo,
  stickyRepo,
  tasksRepo,
} from "./repo";
import {
  toMemoryCategory,
  type DayMark,
  type DayMarkKind,
  type Memory,
  type Note,
  type Recurrence,
  type Sticky,
  type Task,
} from "./types";

export interface ImportPlan {
  path: string;
  /** When the file says it was exported; "" if it didn't say. */
  exportedAt: string;
  notes: Note[];
  tasks: Task[];
  stickies: Sticky[];
  memories: Memory[];
  dayMarks: DayMark[];
  /** Records already present, which will be left untouched. */
  skipped: number;
  /** Records dropped because they were malformed. */
  invalid: number;
  /** How many records would actually be added. */
  total: number;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

/* ---------------------------- validation ---------------------------- */

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

const str = (v: unknown, fallback = ""): string => (isStr(v) ? v : fallback);
const num = (v: unknown, fallback = 0): number => (isNum(v) ? v : fallback);
/** SQLite has no bool; the schema stores 0/1 and so must anything we insert. */
const flag = (v: unknown): number => (v === 1 || v === true ? 1 : 0);

/**
 * Each of these normalises as much as it validates. A file that has been
 * hand-edited, or written by an older version, is far more likely to be missing
 * an optional field than to be genuinely broken — so only the fields a row
 * cannot exist without are grounds for rejecting it.
 */
function asNote(v: unknown): Note | null {
  const r = rec(v);
  if (!r || !isStr(r.id) || !r.id || !isNum(r.created_at)) return null;
  return {
    id: r.id,
    title: str(r.title),
    content_json: str(r.content_json, "[]"),
    body_text: str(r.body_text),
    icon: str(r.icon),
    archived: flag(r.archived),
    pinned: flag(r.pinned),
    created_at: r.created_at,
    updated_at: num(r.updated_at, r.created_at),
  };
}

const RECURRENCES: Recurrence[] = [
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "yearly",
];

function asTask(v: unknown): Task | null {
  const r = rec(v);
  if (!r || !isStr(r.id) || !r.id || !isNum(r.created_at)) return null;
  const recur = RECURRENCES.find((x) => x === r.recur) ?? null;
  return {
    id: r.id,
    title: str(r.title),
    description: str(r.description),
    done: flag(r.done),
    due_at: isNum(r.due_at) ? r.due_at : null,
    due_has_time: flag(r.due_has_time),
    priority: Math.min(3, Math.max(0, Math.trunc(num(r.priority)))),
    note_id: isStr(r.note_id) && r.note_id ? r.note_id : null,
    position: num(r.position),
    notified: flag(r.notified),
    // A repeat without a due date has nothing to roll forward.
    recur: isNum(r.due_at) ? recur : null,
    created_at: r.created_at,
  };
}

function asSticky(v: unknown): Sticky | null {
  const r = rec(v);
  if (!r || !isStr(r.id) || !r.id || !isNum(r.created_at)) return null;
  return {
    id: r.id,
    content: str(r.content),
    color: str(r.color, "yellow"),
    x: isNum(r.x) ? r.x : null,
    y: isNum(r.y) ? r.y : null,
    width: num(r.width, 240),
    height: num(r.height, 240),
    pinned: flag(r.pinned),
    created_at: r.created_at,
    updated_at: num(r.updated_at, r.created_at),
  };
}

function asMemory(v: unknown): Memory | null {
  const r = rec(v);
  if (!r || !isStr(r.id) || !r.id || !isNum(r.created_at)) return null;
  return {
    id: r.id,
    title: str(r.title),
    content: str(r.content),
    category: toMemoryCategory(str(r.category)),
    enabled: r.enabled === 0 || r.enabled === false ? 0 : 1,
    created_at: r.created_at,
    updated_at: num(r.updated_at, r.created_at),
  };
}

const MARK_KINDS: DayMarkKind[] = ["busy", "tentative", "away"];

function asDayMark(v: unknown): DayMark | null {
  const r = rec(v);
  // The day *is* the key here, so an unparseable one has nothing to attach to.
  if (!r || !isStr(r.day) || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null;
  const kind = MARK_KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  return {
    day: r.day,
    kind,
    note: str(r.note),
    created_at: num(r.created_at, Date.now()),
  };
}

/* ------------------------------ planning ------------------------------ */

/** Pick a file, read it, and work out what importing it would change. */
export async function planImport(): Promise<ImportPlan | null> {
  const path = await open({
    multiple: false,
    directory: false,
    title: "Choose a Thinkstack export",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (typeof path !== "string") return null;

  const text = await invoke<string>("import_read_file", { path });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const root = rec(parsed);
  if (!root || root.app !== "Thinkstack") {
    throw new Error("That doesn't look like a Thinkstack export.");
  }
  if (num(root.format) > EXPORT_FORMAT) {
    throw new Error(
      "That export was written by a newer version of Thinkstack than this one."
    );
  }

  const [notes, trashed, tasks, stickies, memories, marks] = await Promise.all([
    notesRepo.list(),
    notesRepo.listArchived(),
    tasksRepo.list(),
    stickyRepo.list(),
    memoriesRepo.list(),
    dayMarksRepo.list(),
  ]);

  const have = {
    notes: new Set([...notes, ...trashed].map((n) => n.id)),
    tasks: new Set(tasks.map((t) => t.id)),
    stickies: new Set(stickies.map((s) => s.id)),
    memories: new Set(memories.map((m) => m.id)),
    marks: new Set(marks.map((m) => m.day)),
  };

  let skipped = 0;
  let invalid = 0;

  /** Validate a collection, dropping what's malformed and what's already here. */
  const take = <T>(
    raw: unknown,
    as: (v: unknown) => T | null,
    key: (t: T) => string,
    present: Set<string>
  ): T[] => {
    if (!Array.isArray(raw)) return [];
    const out: T[] = [];
    for (const item of raw) {
      const value = as(item);
      if (!value) {
        invalid++;
      } else if (present.has(key(value))) {
        skipped++;
      } else {
        out.push(value);
        // Guard against an export that repeats an id inside its own file.
        present.add(key(value));
      }
    }
    return out;
  };

  const plan: ImportPlan = {
    path,
    exportedAt: str(root.exported_at),
    notes: take(root.notes, asNote, (n) => n.id, have.notes),
    tasks: take(root.tasks, asTask, (t) => t.id, have.tasks),
    stickies: take(root.stickies, asSticky, (s) => s.id, have.stickies),
    memories: take(root.memories, asMemory, (m) => m.id, have.memories),
    dayMarks: take(root.day_marks, asDayMark, (d) => d.day, have.marks),
    skipped,
    invalid,
    total: 0,
  };
  plan.total =
    plan.notes.length +
    plan.tasks.length +
    plan.stickies.length +
    plan.memories.length +
    plan.dayMarks.length;

  return plan;
}

/* ------------------------------ applying ------------------------------ */

/**
 * Write a plan. Notes go first so a task that links to one never points at a
 * note that isn't there yet.
 *
 * No transaction, deliberately. Because import skips ids that already exist,
 * running the same file again is harmless and picks up exactly what a failure
 * left behind — so a half-finished import is recoverable by repeating it, which
 * is the same guarantee a rollback would give without holding a write lock over
 * thousands of inserts.
 */
export async function applyImport(plan: ImportPlan): Promise<ImportResult> {
  for (const n of plan.notes) await importRepo.insertNote(n);
  for (const t of plan.tasks) await tasksRepo.create(t);
  for (const s of plan.stickies) await stickyRepo.create(s);
  for (const m of plan.memories) await memoriesRepo.create(m);
  for (const d of plan.dayMarks) await dayMarksRepo.upsert(d);
  return { added: plan.total, skipped: plan.skipped };
}
