import { nanoid } from "nanoid";
import { getDb, now } from "./db";
import type {
  AppNotification,
  BoardKind,
  BoardPlacement,
  DayMark,
  Memory,
  Note,
  Task,
  Sticky,
  SearchHit,
  Tag,
  TagWithCount,
  Worker,
} from "./types";
import { toLinkKind, toNotificationKind } from "./types";

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

/* ---------------------------- Memories ---------------------------- */

export const memoriesRepo = {
  /** Newest first — stable while a card is being edited, unlike updated_at. */
  async list(): Promise<Memory[]> {
    const db = await getDb();
    return db.select<Memory[]>("SELECT * FROM memories ORDER BY created_at DESC");
  },

  async create(m: Memory): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO memories (id, title, content, category, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.title, m.content, m.category, m.enabled, m.created_at, m.updated_at]
    );
  },

  async update(
    id: string,
    patch: Partial<Pick<Memory, "title" | "content" | "category" | "enabled">>
  ): Promise<void> {
    const db = await getDb();
    const { fields, values } = setClause(patch, [
      "title",
      "content",
      "category",
      "enabled",
    ]);
    if (!fields.length) return;
    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);
    await db.execute(`UPDATE memories SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM memories WHERE id = ?", [id]);
  },
};

/* ---------------------------- Workers ----------------------------- */

export const workersRepo = {
  async list(): Promise<Worker[]> {
    const db = await getDb();
    return db.select<Worker[]>("SELECT * FROM workers ORDER BY created_at DESC");
  },

  async create(w: Worker): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO workers (id, repo_path, repo_label, source_kind, source_number, title,
                            prompt, branch, worktree_path, base_sha, depends_on, status, error,
                            session_id, cost_usd, pr_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        w.id,
        w.repo_path,
        w.repo_label,
        w.source_kind,
        w.source_number,
        w.title,
        w.prompt,
        w.branch,
        w.worktree_path,
        w.base_sha,
        w.depends_on,
        w.status,
        w.error,
        w.session_id,
        w.cost_usd,
        w.pr_url,
        w.created_at,
        w.updated_at,
      ]
    );
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        Worker,
        | "status"
        | "error"
        | "session_id"
        | "cost_usd"
        | "pr_url"
        | "worktree_path"
        | "base_sha"
        | "title"
        | "prompt"
      >
    >
  ): Promise<void> {
    const db = await getDb();
    const { fields, values } = setClause(patch, [
      "status",
      "error",
      "session_id",
      "cost_usd",
      "pr_url",
      "worktree_path",
      "base_sha",
      "title",
      "prompt",
    ]);
    if (!fields.length) return;
    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);
    await db.execute(`UPDATE workers SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  /**
   * Worker processes die with the app, so anything still marked running at
   * startup is an orphan from a previous launch.
   *
   * A `queued` worker is deliberately left alone: it holds no process, so it
   * survives a restart intact and the scheduler picks it up when its parent is
   * approved. What it cannot survive is losing that parent — a discarded,
   * failed or stopped one will never be approved, so those rows would wait
   * forever. Strand them explicitly rather than leaving them to look pending.
   */
  async reconcileOrphans(): Promise<void> {
    const db = await getDb();
    const ts = now();
    await db.execute(
      "UPDATE workers SET status = 'stopped', updated_at = ? WHERE status = 'running'",
      [ts]
    );
    await db.execute(
      `UPDATE workers
          SET status = 'failed',
              error = 'The worker this one was waiting for is gone, so it can never start.',
              updated_at = ?
        WHERE status = 'queued'
          AND depends_on <> ''
          AND (depends_on NOT IN (SELECT id FROM workers)
               OR depends_on IN (SELECT id FROM workers
                                  WHERE status IN ('failed', 'stopped')))`,
      [ts]
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM workers WHERE id = ?", [id]);
  },
};

/* ----------------------------- Import ----------------------------- */

export const importRepo = {
  /**
   * Insert a note exactly as it was exported.
   *
   * `notesRepo.create` is for notes the user is writing now, so it forces
   * `archived = 0` and leaves `pinned` at its default. An import has to carry
   * both across, or a restored trash comes back as live notes and every pin is
   * quietly lost. The FTS triggers pick the row up either way.
   */
  async insertNote(n: Note): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO notes (id, title, content_json, body_text, icon, archived, pinned,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        n.id,
        n.title,
        n.content_json,
        n.body_text,
        n.icon,
        n.archived,
        n.pinned,
        n.created_at,
        n.updated_at,
      ]
    );
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

/* ------------------------------ Board ------------------------------ */

export const boardRepo = {
  async list(): Promise<BoardPlacement[]> {
    const db = await getDb();
    return db.select<BoardPlacement[]>(
      "SELECT * FROM board_items ORDER BY position ASC"
    );
  },

  /** Save (or move) one card's column and order within it. */
  async place(p: BoardPlacement): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO board_items (kind, item_id, stage, position, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(kind, item_id) DO UPDATE SET
         stage = excluded.stage,
         position = excluded.position,
         updated_at = excluded.updated_at`,
      [p.kind, p.item_id, p.stage, p.position, p.updated_at]
    );
  },

  async remove(kind: BoardKind, itemId: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM board_items WHERE kind = ? AND item_id = ?", [
      kind,
      itemId,
    ]);
  },

  /**
   * Drop placements whose item is gone (deleted task, trashed note, discarded
   * worker). Nothing renders for them either way; this just stops the table
   * growing forever. Run once per load.
   */
  async prune(): Promise<void> {
    const db = await getDb();
    await db.execute(
      `DELETE FROM board_items
       WHERE (kind = 'task'   AND item_id NOT IN (SELECT id FROM tasks))
          OR (kind = 'note'   AND item_id NOT IN (SELECT id FROM notes WHERE archived = 0))
          OR (kind = 'sticky' AND item_id NOT IN (SELECT id FROM sticky_notes))
          OR (kind = 'worker' AND item_id NOT IN (SELECT id FROM workers))
          OR kind NOT IN ('task', 'note', 'sticky', 'worker')`
    );
  },
};

/* -------------------------- Notifications -------------------------- */

/** Newest entries kept; the rest are dropped once the cap is passed. */
export const NOTIFICATION_CAP = 200;

/**
 * Length limits for stored text. Bodies carry things like a worker's stderr,
 * which has no natural bound — and these rows are kept indefinitely, so an
 * unclamped write is a slow leak into the database file.
 */
const NOTIFICATION_LIMITS = { event_key: 200, title: 200, body: 2000 } as const;

function clamp(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export const notificationsRepo = {
  async list(): Promise<AppNotification[]> {
    const db = await getDb();
    return db.select<AppNotification[]>(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?",
      [NOTIFICATION_CAP]
    );
  },

  /**
   * Record one notification, after forcing it into shape: kinds are coerced to
   * known values and text is clamped, so a caller passing a stray status
   * string or a megabyte of worker output can't put junk in the table.
   *
   * Returns false when nothing was written — either the entry was unusable
   * (no title) or its event was already recorded. The UNIQUE event_key, not
   * the caller, is what settles the duplicate case.
   */
  async add(n: AppNotification): Promise<AppNotification | null> {
    const row: AppNotification = {
      ...n,
      kind: toNotificationKind(n.kind),
      event_key: clamp(n.event_key, NOTIFICATION_LIMITS.event_key),
      title: clamp(n.title, NOTIFICATION_LIMITS.title),
      body: clamp(n.body, NOTIFICATION_LIMITS.body),
      link_kind: toLinkKind(n.link_kind),
      read: n.read ? 1 : 0,
    };
    // Without a title there is nothing to render, and without a key the
    // UNIQUE index can't do its job.
    if (!row.title || !row.event_key) return null;
    // A link kind that didn't survive validation would leave a dangling id.
    if (!row.link_kind) row.link_id = "";

    const db = await getDb();
    const res = await db.execute(
      `INSERT OR IGNORE INTO notifications
         (id, kind, event_key, title, body, link_kind, link_id, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.kind,
        row.event_key,
        row.title,
        row.body,
        row.link_kind,
        row.link_id,
        row.read,
        row.created_at,
      ]
    );
    return res.rowsAffected > 0 ? row : null;
  },

  async markRead(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
  },

  async markAllRead(): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE notifications SET read = 1 WHERE read = 0");
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM notifications WHERE id = ?", [id]);
  },

  async clear(): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM notifications");
  },

  /**
   * Keep the feed bounded, and disarm links whose item is gone — a deleted
   * task or trashed note would otherwise open to nothing. The entry itself
   * stays: "Task due: pay rent" is still true after the task is deleted.
   * Run on load and whenever the cap is passed.
   */
  async prune(): Promise<void> {
    const db = await getDb();
    await db.execute(
      `DELETE FROM notifications WHERE id NOT IN (
         SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?
       )`,
      [NOTIFICATION_CAP]
    );
    await db.execute(
      `UPDATE notifications SET link_kind = '', link_id = ''
       WHERE (link_kind = 'task'   AND link_id NOT IN (SELECT id FROM tasks))
          OR (link_kind = 'note'   AND link_id NOT IN (SELECT id FROM notes WHERE archived = 0))
          OR (link_kind = 'sticky' AND link_id NOT IN (SELECT id FROM sticky_notes))
          OR (link_kind = 'worker' AND link_id NOT IN (SELECT id FROM workers))
          OR link_kind NOT IN ('', 'task', 'note', 'sticky', 'worker')`
    );
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
