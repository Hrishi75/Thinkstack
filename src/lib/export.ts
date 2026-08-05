/**
 * Getting your data out.
 *
 * Three ways, because they answer different questions: Markdown when you want
 * your notes readable somewhere else, JSON when you want every record, and a
 * database backup when you want the thing itself.
 *
 * Paths always come from a dialog the user clicked through — nothing here
 * picks a location on its own.
 */

import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { BlockNoteEditor } from "@blocknote/core";
import { getDb } from "./db";
import {
  boardRepo,
  dayMarksRepo,
  memoriesRepo,
  notesRepo,
  stickyRepo,
  tasksRepo,
} from "./repo";
import type {
  BoardPlacement,
  DayMark,
  Memory,
  Note,
  Sticky,
  Task,
} from "./types";

/** Envelope version, so a future importer can recognise what it's reading. */
export const EXPORT_FORMAT = 1;

/** Shape of the JSON export — the contract the importer reads back. */
export interface WorkspaceExport {
  format: number;
  app: string;
  exported_at: string;
  notes: Note[];
  tasks: Task[];
  stickies: Sticky[];
  memories: Memory[];
  day_marks: DayMark[];
  board: BoardPlacement[];
}

export interface ExportResult {
  /** One line for the toast. */
  summary: string;
  path: string;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Windows dialogs hand back backslashes; don't mix separators in one path. */
function joinPath(dir: string, name: string): string {
  return `${dir}${dir.includes("\\") ? "\\" : "/"}${name}`;
}

/**
 * A note title is free text; a file name is not. Strip what no filesystem will
 * take, keep it short enough to survive a copy onto another one, and number the
 * duplicates — two notes called "Ideas" must not become one file.
 */
function fileNameFor(title: string, used: Set<string>): string {
  const cleaned = (title ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    // Trim before stripping leading dots, not after: " .hidden" would
    // otherwise keep its dot and land as a hidden file.
    .trim()
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80)
    .trim();

  const base = cleaned || "Untitled";
  let name = `${base}.md`;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base} (${n++}).md`;
  used.add(name.toLowerCase());
  return name;
}

type HeadlessEditor = ReturnType<typeof BlockNoteEditor.create>;

/**
 * Render one note's blocks as Markdown, falling back to the plain-text mirror
 * kept for search. A note whose blocks won't parse still exports with its words
 * intact, which matters more here than fidelity: this is the copy you keep.
 */
async function noteToMarkdown(editor: HeadlessEditor, note: Note): Promise<string> {
  try {
    const blocks = JSON.parse(note.content_json);
    if (Array.isArray(blocks) && blocks.length) {
      return await editor.blocksToMarkdownLossy(blocks);
    }
  } catch {
    // Unparseable or empty — the body text below is the honest fallback.
  }
  return note.body_text ?? "";
}

/** Front matter other tools can read, then the note itself. */
function markdownDoc(note: Note, body: string): string {
  const front = [
    "---",
    `title: ${JSON.stringify(note.title || "Untitled")}`,
    `created: ${new Date(note.created_at).toISOString()}`,
    `updated: ${new Date(note.updated_at).toISOString()}`,
    ...(note.icon ? [`icon: ${JSON.stringify(note.icon)}`] : []),
    ...(note.pinned ? ["pinned: true"] : []),
    "---",
    "",
  ];
  return `${front.join("\n")}${body.trim()}\n`;
}

/** Every live note as its own `.md` file, in a dated folder you pick. */
export async function exportNotesMarkdown(): Promise<ExportResult | null> {
  const dir = await open({
    directory: true,
    title: "Choose where to save your notes",
  });
  if (typeof dir !== "string") return null;

  const notes = await notesRepo.list();
  if (!notes.length) throw new Error("There are no notes to export.");

  const editor = BlockNoteEditor.create();
  const used = new Set<string>();
  const files: { name: string; contents: string }[] = [];
  for (const note of notes) {
    const body = await noteToMarkdown(editor, note);
    files.push({
      name: fileNameFor(note.title, used),
      contents: markdownDoc(note, body),
    });
  }

  // Its own folder, so an export never scatters files through Documents.
  const target = joinPath(dir, `Thinkstack Notes ${stamp()}`);
  const written = await invoke<number>("export_write_bundle", { dir: target, files });
  return {
    summary: `${written} note${written === 1 ? "" : "s"} exported as Markdown`,
    path: target,
  };
}

/**
 * Every record as one JSON file — including trashed notes, which a backup has
 * no business dropping. Workers and notifications are left out: both describe
 * this machine at this moment rather than anything you wrote.
 */
export async function exportWorkspaceJson(): Promise<ExportResult | null> {
  const path = await save({
    title: "Export everything as JSON",
    defaultPath: `thinkstack-${stamp()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;

  const [notes, trashed, tasks, stickies, memories, dayMarks, board] =
    await Promise.all([
      notesRepo.list(),
      notesRepo.listArchived(),
      tasksRepo.list(),
      stickyRepo.list(),
      memoriesRepo.list(),
      dayMarksRepo.list(),
      boardRepo.list(),
    ]);

  const payload: WorkspaceExport = {
    format: EXPORT_FORMAT,
    app: "Thinkstack",
    exported_at: new Date().toISOString(),
    notes: [...notes, ...trashed],
    tasks,
    stickies,
    memories,
    day_marks: dayMarks,
    board,
  };

  await invoke("export_write_file", {
    path,
    contents: JSON.stringify(payload, null, 2),
  });

  const count =
    notes.length +
    trashed.length +
    tasks.length +
    stickies.length +
    memories.length;
  return { summary: `${count} items exported`, path };
}

/**
 * A consistent copy of the database file.
 *
 * `VACUUM INTO` rather than a file copy: SQLite runs in WAL mode here, so the
 * `.db` on disk is only part of the story until the log is checkpointed, and
 * copying it alone can silently lose the last things you wrote.
 */
export async function backupDatabase(): Promise<ExportResult | null> {
  const path = await save({
    title: "Back up the database",
    defaultPath: `thinkstack-backup-${stamp()}.db`,
    filters: [{ name: "SQLite database", extensions: ["db"] }],
  });
  if (!path) return null;

  const db = await getDb();
  try {
    // VACUUM INTO takes a literal, never a bound parameter, so the path is
    // escaped the way SQL string literals are: one quote becomes two.
    await db.execute(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
  } catch (e) {
    // It refuses to write over an existing file, by design — say so plainly
    // rather than passing along a raw SQLite error.
    if (/exists/i.test(String(e))) {
      throw new Error(
        "A file is already there. Pick a name that isn't taken — a backup will never overwrite one."
      );
    }
    throw e;
  }
  return { summary: "Database backed up", path };
}
