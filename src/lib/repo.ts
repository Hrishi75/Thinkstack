import { nanoid } from "nanoid";
import { getDb, now } from "./db";
import type {
  DayMark,
  Note,
  Task,
  Sticky,
  SearchHit,
  Tag,
  TagWithCount,
} from "./types";

/**
 * Build a `SET` clause from a patch, keeping only allow-listed columns.
 * Patches come from typed call sites, but the column names end up
 * interpolated into SQL — the allowlist guarantees nothing else can.
 */
function setClause(
  patch: Record<string, unknown>,
  allowed: readonly string[]
): { fields: string[]; values: (string | number | null)[] } {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  for (const key of allowed) {
    if (key in patch) {
      fields.push(`${key} = ?`);
      values.push(patch[key] as string | number | null);
    }
  }
  return { fields, values };
}

/* ----------------------------- Notes ----------------------------- */

export const notesRepo = {
  async list(): Promise<Note[]> {
    const db = await getDb();
    return db.select<Note[]>(
      "SELECT * FROM notes WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC"
    );
  },

  async get(id: string): Promise<Note | undefined> {
    const db = await getDb();
    const rows = await db.select<Note[]>("SELECT * FROM notes WHERE id = ?", [id]);
    return rows[0];
  },

  async create(note: Note): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO notes (id, title, content_json, body_text, icon, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        note.id,
        note.title,
        note.content_json,
        note.body_text,
        note.icon,
        note.created_at,
        note.updated_at,
      ]
    );
  },

  async update(
    id: string,
    patch: Partial<Pick<Note, "title" | "content_json" | "body_text" | "icon">>
  ): Promise<void> {
    const db = await getDb();
    const { fields, values } = setClause(patch, [
      "title",
      "content_json",
      "body_text",
      "icon",
    ]);
    if (!fields.length) return;
    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);
    await db.execute(`UPDATE notes SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async setPinned(id: string, pinned: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE notes SET pinned = ? WHERE id = ?", [pinned, id]);
  },

  async archive(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE notes SET archived = 1, updated_at = ? WHERE id = ?", [
      now(),
      id,
    ]);
  },

  /** Archived notes, most recently trashed first. */
  async listArchived(): Promise<Note[]> {
    const db = await getDb();
    return db.select<Note[]>(
      "SELECT * FROM notes WHERE archived = 1 ORDER BY updated_at DESC"
    );
  },

  async restore(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE notes SET archived = 0, updated_at = ? WHERE id = ?", [
      now(),
      id,
    ]);
  },

  /** Permanently delete a note; note_tags cascade and FTS triggers clean up. */
  async removeForever(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM notes WHERE id = ?", [id]);
    await scrubDeletedPages();
  },

  /** Permanently delete every archived note. */
  async emptyTrash(): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM notes WHERE archived = 1");
    await scrubDeletedPages();
  },
};

/**
 * SQLite DELETE only unlinks pages — the deleted text stays in the file's
 * freelist and WAL until overwritten. After a permanent delete, rebuild the
 * db and truncate the WAL so "delete forever" actually removes the bytes.
 * Best-effort: a concurrent reader can make the checkpoint a no-op.
 */
async function scrubDeletedPages(): Promise<void> {
  try {
    const db = await getDb();
    await db.execute("VACUUM");
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // scrubbing is defense-in-depth; the rows are already gone
  }
}

/* ----------------------------- Tasks ----------------------------- */

export const tasksRepo = {
  async list(): Promise<Task[]> {
    const db = await getDb();
    return db.select<Task[]>(
      "SELECT * FROM tasks ORDER BY done ASC, position ASC, created_at DESC"
    );
  },

  async create(task: Task): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO tasks (id, title, description, done, due_at, due_has_time, priority, note_id, position, notified, recur, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.description,
        task.done,
        task.due_at,
        task.due_has_time,
        task.priority,
        task.note_id,
        task.position,
        task.notified,
        task.recur,
        task.created_at,
      ]
    );
  },

  async update(id: string, patch: Partial<Task>): Promise<void> {
    const db = await getDb();
    const { fields, values } = setClause(patch, [
      "title",
      "description",
      "done",
      "due_at",
      "due_has_time",
      "priority",
      "note_id",
      "position",
      "notified",
      "recur",
    ]);
    if (!fields.length) return;
    values.push(id);
    await db.execute(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
  },
};

/* --------------------------- Day marks --------------------------- */

export const dayMarksRepo = {
  async list(): Promise<DayMark[]> {
    const db = await getDb();
    return db.select<DayMark[]>("SELECT * FROM day_marks");
  },

  async upsert(mark: DayMark): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO day_marks (day, kind, note, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET kind = excluded.kind, note = excluded.note`,
      [mark.day, mark.kind, mark.note, mark.created_at]
    );
  },

  async remove(day: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM day_marks WHERE day = ?", [day]);
  },
};

/* ----------------------------- Sticky ----------------------------- */

export const stickyRepo = {
  async list(): Promise<Sticky[]> {
    const db = await getDb();
    return db.select<Sticky[]>("SELECT * FROM sticky_notes ORDER BY created_at DESC");
  },

  async get(id: string): Promise<Sticky | undefined> {
    const db = await getDb();
    const rows = await db.select<Sticky[]>(
      "SELECT * FROM sticky_notes WHERE id = ?",
      [id]
    );
    return rows[0];
  },

  async create(s: Sticky): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO sticky_notes (id, content, color, x, y, width, height, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.content, s.color, s.x, s.y, s.width, s.height, s.pinned, s.created_at, s.updated_at]
    );
  },

  async update(id: string, patch: Partial<Sticky>): Promise<void> {
    const db = await getDb();
    const { fields, values } = setClause(patch, [
      "content",
      "color",
      "x",
      "y",
      "width",
      "height",
      "pinned",
    ]);
    if (!fields.length) return;
    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);
    await db.execute(
      `UPDATE sticky_notes SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM sticky_notes WHERE id = ?", [id]);
  },
};

/* ------------------------------ Tags ------------------------------ */

interface NoteTagRow extends Tag {
  note_id: string;
}

export const tagsRepo = {
  /** All tags with the number of (non-archived consideration left to caller) notes attached. */
  async list(): Promise<TagWithCount[]> {
    const db = await getDb();
    return db.select<TagWithCount[]>(
      `SELECT t.id, t.name, t.color, t.created_at, COUNT(nt.note_id) AS count
       FROM tags t
       LEFT JOIN note_tags nt ON nt.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name COLLATE NOCASE`
    );
  },

  /** Every note→tag link, joined with tag data, for building an in-memory map. */
  async links(): Promise<NoteTagRow[]> {
    const db = await getDb();
    return db.select<NoteTagRow[]>(
      `SELECT nt.note_id, t.id, t.name, t.color, t.created_at
       FROM note_tags nt
       JOIN tags t ON t.id = nt.tag_id
       ORDER BY t.name COLLATE NOCASE`
    );
  },

  /** Find an existing tag by name (case-insensitive) or create a new one. */
  async ensure(name: string, color: string): Promise<Tag> {
    const db = await getDb();
    const trimmed = name.trim();
    const existing = await db.select<Tag[]>(
      "SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1",
      [trimmed]
    );
    if (existing[0]) return existing[0];
    const tag: Tag = { id: nanoid(), name: trimmed, color, created_at: now() };
    await db.execute(
      "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
      [tag.id, tag.name, tag.color, tag.created_at]
    );
    return tag;
  },

  async attach(noteId: string, tagId: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
      [noteId, tagId]
    );
  },

  async detach(noteId: string, tagId: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?",
      [noteId, tagId]
    );
  },

  /** Delete a tag entirely; note_tags rows cascade away. */
  async remove(tagId: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tags WHERE id = ?", [tagId]);
  },
};

/* ----------------------------- Search ----------------------------- */

/** Turn raw user input into a safe FTS5 prefix query. */
function toFtsQuery(raw: string): string {
  const terms = raw
    .toLowerCase()
    .replace(/["()*:^]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return "";
  return terms.map((t) => `"${t}"*`).join(" AND ");
}

export async function searchNotes(raw: string): Promise<SearchHit[]> {
  const q = toFtsQuery(raw);
  if (!q) return [];
  const db = await getDb();
  // Join back to notes so trashed (archived) notes never surface in search.
  return db.select<SearchHit[]>(
    `SELECT notes_fts.note_id,
            notes_fts.title,
            snippet(notes_fts, 2, '⟦', '⟧', '…', 12) AS snippet
     FROM notes_fts
     JOIN notes n ON n.id = notes_fts.note_id AND n.archived = 0
     WHERE notes_fts MATCH ?
     ORDER BY rank
     LIMIT 30`,
    [q]
  );
}
