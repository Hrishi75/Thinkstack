# Architecture

Thinkstack is a [Tauri 2](https://tauri.app) desktop app: a Rust backend that
owns the OS-level concerns (windows, global shortcuts, the SQLite connection)
and a React + TypeScript frontend that renders every window.

## High-Level Overview

```
┌──────────────────────────────────────────────────────────┐
│  Rust backend (src-tauri)                                  │
│  • window management (main, sticky-*, quick-capture)       │
│  • global shortcut (⌘⇧Space)                               │
│  • tauri-plugin-sql + migrations → thinkstack.db (SQLite)  │
└───────────────▲───────────────────────────┬───────────────┘
                │ invoke / events            │ SQL
┌───────────────┴───────────────────────────▼───────────────┐
│  React frontend (src)                                       │
│  Views → Zustand stores → repository → getDb() → SQLite     │
└────────────────────────────────────────────────────────────┘
```

## Frontend Layers

The frontend follows a one-directional flow: **UI → store → repository → database**.

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Views | `src/features/*`, `src/components` | Render UI, dispatch user actions to stores |
| Windows | `src/windows/*` | Standalone window roots (sticky, quick capture) |
| Stores | `src/store/*` | [Zustand](https://github.com/pmndrs/zustand) state; call the repository and hold the in-memory copy |
| Repository | `src/lib/repo.ts` | All SQL queries, grouped by domain (`notesRepo`, `tasksRepo`, `stickyRepo`, `searchNotes`) |
| DB access | `src/lib/db.ts` | Lazily opens a single shared SQLite connection |
| Types | `src/lib/types.ts` | Shared row/entity types and constants |

Components never touch SQL directly — they go through a store, which calls the
repository. This keeps queries in one place and views easy to reason about.

One deliberate exception: [`src/lib/export.ts`](src/lib/export.ts) reads the
repositories directly rather than through a store. An export is a one-shot read
of everything with no state to hold afterwards, so a store would be pure
ceremony — but it is the only module that skips a layer.

### Stores

Each domain has its own Zustand store (`notes`, `tasks`, `sticky`, `memory`,
`orchestrator`), plus a `ui` store for cross-cutting state: the active view, theme, command-palette
visibility, and the transient toast (used for undo after deleting a note). Stores load data on startup and re-fetch when the underlying data
changes (see *Multi-Window* below). The `board` store is the one exception to
the one-store-per-domain rule: it holds only board placements and derives its
cards by reading the domain stores (see *The Board*).

## Multi-Window Model

A single `index.html` entry point renders different roots based on a
`?window=` query parameter, resolved in [`src/main.tsx`](src/main.tsx):

| Window | URL | Root component | Created by |
|--------|-----|----------------|------------|
| Main | `index.html` | `<App />` | Tauri at startup |
| Sticky | `index.html?window=sticky&id=…` | `<StickyWindow />` | `open_sticky` command |
| Quick capture | `index.html?window=capture` | `<QuickCapture />` | `toggle_quick_capture` command |

Sticky and quick-capture windows are created from Rust commands in
[`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) (`open_sticky`,
`toggle_quick_capture`, `show_main`) as frameless, transparent, always-on-top
windows.

### Cross-Window Sync

All windows share the same SQLite database. When a secondary window (e.g. quick
capture) writes data, it emits a `thinkstack://refresh` event; the main window
listens for it and reloads its stores so the UI stays consistent. This keeps
windows decoupled — they coordinate through the database and a single event,
not shared in-memory state.

## Data & Persistence

- **Engine** — SQLite in WAL mode, accessed via `tauri-plugin-sql`.
- **Connection** — one lazily-opened connection shared across the frontend (`getDb()`).
- **Migrations** — versioned SQL files in `src-tauri/migrations/`, registered in
  `lib.rs` and applied automatically at startup.

### Schema

| Table | Purpose |
|-------|---------|
| `notes` | Note documents (`content_json` for BlockNote, `body_text` projection for search), icon, pinned/archived flags |
| `tasks` | Tasks with an optional `description`, priority, due date (`due_at`, plus `due_has_time` when it carries a time of day), fractional `position` for ordering, optional `note_id` FK, and a `notified` flag so due reminders fire once |
| `memories` | Standing AI context: titled entries with a `category` and an `enabled` flag |
| `workers` | Orchestration sessions: source issue/PR, branch, worktree path, `base_sha`, status, and `depends_on` for a worker queued behind another |
| `sticky_notes` | Sticky content, color, geometry (x/y/width/height) |
| `board_items` | Where the user dragged one item on the unified board: `(kind, item_id)` → `stage` + `position` |
| `notifications` | In-app feed entries: `kind`, a UNIQUE `event_key` for dedupe, `read` flag, and the item to open (`link_kind`, `link_id`) |
| `notes_fts` | FTS5 virtual table mirroring note text for search |

### Full-Text Search

`notes_fts` is a standalone FTS5 table (tokenizer: `porter unicode61`) kept in
sync with `notes` via `AFTER INSERT/UPDATE/DELETE` triggers. The
`searchNotes()` helper sanitizes user input into a safe prefix query
(`"term"* AND …`) and returns ranked results with highlighted `snippet()`
fragments. Results join back to `notes` so trashed (archived) notes never
surface in search.

### The Board

The Board is the one view that spans domains: tasks, notes, stickies, and
workers become cards in four columns. It owns no entities of its own — it's a
projection, assembled by `useBoardCards()` in
[`src/store/board.ts`](src/store/board.ts) from the four domain stores plus the
`board_items` placements.

- **Resolving a column** — an item with a placement sits where the user put it.
  Everything else falls back to a stage derived from its own state (a task with
  a due date → *To do*, a running worker → *In progress*, a worker still queued
  behind another → *Backlog*), so the board is useful before anyone has dragged
  anything.
- **Done is the task checkbox** — for tasks, `done` outranks any placement in
  both directions: completing a task anywhere moves its card, and dropping a
  card into *Done* writes `done = 1`. This keeps the board and the task list
  from disagreeing.
- **Ordering** — placed cards sort first by `position`, then unplaced ones by
  recency. A drop renumbers the whole target column (`0…n-1`) rather than
  interpolating, mirroring `useTasks.reorder()`.
- **Stale rows** — deleting a task or trashing a note leaves its placement
  behind; nothing renders for it, and `boardRepo.prune()` clears the orphans on
  every load.

### Notifications

`announce()` in [`src/store/notifications.ts`](src/store/notifications.ts) is
the single way the app tells the user that something happened. Every call
records a feed entry; the other two channels are layered on top of it, never
instead of it:

| Channel | When | Where |
|---------|------|-------|
| Feed entry | always | the bell in the sidebar header |
| Toast | the user is present and just acted | `showToast`, bottom-center |
| Desktop banner | the user may be in another app | `tauri-plugin-notification` |

That inversion is the point: a producer can't accidentally ship a message that
never reaches the notification center, because the center *is* the code path.
Immediate feedback on an action that changed no state ("Copied to clipboard")
is not an event and keeps calling `showToast` directly — a permanent record of
it would only bury the entries that matter.

Producers pass `{ kind, title, body, link, toast, desktop }` plus an optional
`eventKey`. The key is the idempotency handle: anything that observes the same
state repeatedly — the once-a-minute due sweep, the `orch://status` stream —
passes a stable one and pushes on every observation, and the UNIQUE index
drops the repeats. One-off user actions omit it and get a unique key, since
they're a distinct event every time.

Guardrails, because these rows are written from event handlers and kept
indefinitely:

- **Shape is forced at the repository**, not trusted from the caller: `kind`
  and `link_kind` are coerced to known values, text is clamped (a worker's
  stderr has no natural bound), and an entry with no title is dropped.
- **`announce()` never throws.** A notification failing is not worth breaking
  a caller that already did its real work.
- **Mutations roll back.** `markRead`/`remove`/`clear` paint first; if the
  write fails the previous list is restored, so the badge can't drift from the
  table.
- **`prune()` caps the feed at 200** — on load *and* on the write that
  overflows, so a long session with a busy orchestrator can't grow it — and
  blanks links whose target is gone, since a deleted task would otherwise open
  to nothing.
- **Clearing is a two-step `ConfirmButton`**; there's no undo for it.

### AI Memory Context

The Memory view stores standing facts the assistant should always know. On every
completion, `useAi.complete()` calls `buildMemoryContext()` (in
[`src/store/memory.ts`](src/store/memory.ts)), which renders the *enabled*
memories — grouped by category, skipping empty ones — into a markdown block
appended to the system prompt. Nothing is injected when no memory is enabled, and
the block is truncated at `MEMORY_CONTEXT_LIMIT` so a large memory can't inflate
every request without bound.

## Orchestration

A *worker* is one non-interactive Claude Code session (`claude -p`) running in
its own git worktree. [`src-tauri/src/orchestrator.rs`](src-tauri/src/orchestrator.rs)
owns the whole lifecycle; the frontend only ever holds view state.

```
Orchestration view → orchestrator store → invoke(orch_*) → Rust
                            ▲                                │
                            └──── orch://log, orch://status ──┘
```

- **Isolation** — each worker gets `git worktree add -b <branch> <app-data>/worktrees/<id>`,
  so N workers edit the same repository concurrently and never share a file. A
  worker for a PR branches from that PR's head ref, not local `HEAD`; a worker
  queued behind another branches from that worker's branch, resolved locally
  (`base_local`) rather than fetched, so a PR head can never silently resolve
  to a stale local branch of the same name.
- **Collision reporting** — isolation stops workers overwriting each other, not
  changing the same file from two branches. `orch_changed_files` reads
  `git diff --name-only <base_sha>` per open worker and the store intersects the
  sets, so an overlap surfaces while it can still be redirected. It reads git
  rather than the worker's tool calls deliberately: git counts edits made
  through the shell, and never mistakes a file that was read for one that was
  rewritten. Polling is gated on something actually running.
- **Dependencies** — `depends_on` names a worker this one waits for. It waits
  for `approved`, not `review`: until approval a worker's last edits may still
  be uncommitted, so branching off it then would quietly lose them. A `queued`
  worker holds no process and no worktree, so it survives a restart intact —
  what it cannot survive is losing its parent, so `reconcileQueue` fails any
  whose parent was discarded, stopped or failed. Promotions run sequentially:
  `git worktree add` mutates one shared repository.
- **Streaming** — the child's stdout is `--output-format stream-json`. A tokio
  task parses each event, emits a readable line as `orch://log`, and on EOF
  reaps the process and emits a final `orch://status`. Logs are in-memory
  (capped per worker); only status, cost, and session id are persisted.
- **Lifecycle** — processes die with the app, so `workers` rows still marked
  `running` at startup are reconciled to `stopped` (`reconcileOrphans`).
  `queued` rows are left alone there — they hold no process — but any whose
  dependency is gone are failed in the same pass.
- **Briefs** — a worker's prompt names the other workers running on the repo and
  the files they are touching, and carries the same standing Memory context
  every AI request does. It is built at spawn, not at enqueue, so a worker that
  waited hours for its dependency still opens with what is true now.
- **Work queue** — open issues and PRs come from `gh issue list` / `gh pr list`
  as JSON.

### Why workers can't publish

`--permission-mode acceptEdits` denies *all* Bash, which would leave a worker
unable to even read its own issue. Workers therefore run with an explicit
`--allowedTools` allowlist covering repo inspection, ticket reading, and local
commits. `git push`, `git remote`, and `gh pr create` are deliberately **not**
on it, so "propose only, never publish" is enforced by the permission layer
rather than by instructions in the prompt. Publishing exists in exactly one
place — `orch_approve`, reachable only from an explicit user click. Build and
test runners are a separate opt-in.

## Export & Import

[`src/lib/export.ts`](src/lib/export.ts) assembles the data,
[`src/lib/import.ts`](src/lib/import.ts) reads it back, and
[`src-tauri/src/export.rs`](src-tauri/src/export.rs) does the file I/O.

- **No filesystem scope** — writing goes through two commands using `std::fs`
  rather than the filesystem plugin, so the webview is never granted a
  directory. Only `dialog:default` is added, and every path comes from a picker
  the user just clicked through.
- **Markdown** — one file per live note, converted by a headless
  `BlockNoteEditor`, falling back per note to the `body_text` projection kept
  for search. A note whose blocks won't parse still exports its words.
- **JSON** — every record under a `format` version, including trashed notes.
  Workers and notifications are excluded: both describe this machine now rather
  than anything the user wrote.
- **Backup** — `VACUUM INTO`, never a file copy. In WAL mode the `.db` alone
  can be missing the most recent writes. It refuses to overwrite, which is
  surfaced as a plain "pick a name that isn't taken" rather than a SQLite error.
- **Names** — note titles become file names, so they are sanitised on the way
  out and validated again in Rust on the way in. The validator bans separators
  and a leading dot, which is what contains a name; it deliberately allows an
  interior `..`, since without separators it cannot name a parent directory and
  refusing it would fail a whole export over a note titled "Wait.. what?".
- **Import is additive** — a record whose id is already present is skipped, not
  overwritten, so the same file can be imported twice with no effect and an
  import can never replace work done since the export. It runs in two steps:
  `planImport` reads, validates and reports what *would* change; nothing is
  written until `applyImport` takes that plan. There is no transaction, and
  that follows from being additive — a failure part-way is recovered by
  importing the file again, without holding a write lock across every insert.
- **Trusting the file** — every incoming record is normalised, not just
  type-checked: missing optional fields take defaults, `priority` is clamped,
  a `recur` without a due date is dropped, and an empty `note_id` becomes
  `NULL` rather than a dangling reference. Only the fields a row cannot exist
  without (`id`, `created_at`) are grounds for rejecting it outright.
  `importRepo.insertNote` exists because `notesRepo.create` forces
  `archived = 0` — importing through it would restore a trash as live notes.

## Security

- **CSP** — a strict Content-Security-Policy is set in `tauri.conf.json`
  (no remote scripts, no remote connects; a looser `devCsp` allows Vite HMR).
- **Capabilities** — windows get only the Tauri permissions they use, listed
  in `src-tauri/capabilities/default.json` (`sql:default` is read-only;
  writes additionally require `sql:allow-execute`).
- **SQL** — all queries are parameterized; dynamically built `UPDATE` clauses
  only accept allow-listed column names (`setClause()` in `repo.ts`).
- **Commands** — Rust commands validate their inputs (e.g. `open_sticky`
  rejects ids that aren't client-generated nanoids) before using them in
  window labels or URLs.
- **Subprocesses** — orchestration shells out to `git`, `gh`, and `claude`
  only. Every invocation passes an argument vector, never a shell string, and
  branch names, worker ids, repo paths, and permission modes are validated
  against allowlists first, so none of it is shell-injectable. The set of
  programs is fixed in code and never assembled from user input.
- **AI keys** — bring-your-own-key AI (`src-tauri/src/ai.rs`) stores keys in
  the OS keychain and makes all provider HTTP calls from Rust, so the key
  never enters the webview after entry and the CSP stays closed to remote
  hosts. The frontend only ever learns *whether* a key is saved. Note that
  enabled **memories** are sent to the provider with every AI request — the
  Memory view previews the exact text so nothing leaves the device unseen.

## Conventions

- Domain logic stays in the repository; views and stores never write raw SQL.
- New persistent data starts with a migration, never an ad-hoc runtime query.
- IDs are client-generated (`nanoid`); timestamps are epoch milliseconds.
