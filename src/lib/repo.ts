import { nanoid } from "nanoid";
import { getDb, now } from "./db";
import type { Note, Task, Sticky, SearchHit, Tag, TagWithCount } from "./types";

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
    const fields: string[] = [];
    const values: (string | number)[] = [];
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k} = ?`);
      values.push(v as string);
    }
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
};

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
      `INSERT INTO tasks (id, title, done, due_at, priority, note_id, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.done,
        task.due_at,
        task.priority,
        task.note_id,
        task.position,
        task.created_at,
      ]
    );
  },

  async update(id: string, patch: Partial<Task>): Promise<void> {
    const db = await getDb();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k === "id") continue;
      fields.push(`${k} = ?`);
      values.push(v as number);
    }
    if (!fields.length) return;
    values.push(id);
    await db.execute(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
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
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k === "id") continue;
      fields.push(`${k} = ?`);
      values.push(v as number);
    }
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
  return db.select<SearchHit[]>(
    `SELECT note_id,
            title,
            snippet(notes_fts, 2, '⟦', '⟧', '…', 12) AS snippet
     FROM notes_fts
     WHERE notes_fts MATCH ?
     ORDER BY rank
     LIMIT 30`,
    [q]
  );
}
