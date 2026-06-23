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

### Stores

Each domain has its own Zustand store (`notes`, `tasks`, `sticky`), plus a `ui`
store for cross-cutting state: the active view, theme, and command-palette
visibility. Stores load data on startup and re-fetch when the underlying data
changes (see *Multi-Window* below).

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
| `tasks` | Tasks with priority, due date, fractional `position` for ordering, optional `note_id` FK |
| `sticky_notes` | Sticky content, color, geometry (x/y/width/height) |
| `notes_fts` | FTS5 virtual table mirroring note text for search |

### Full-Text Search

`notes_fts` is a standalone FTS5 table (tokenizer: `porter unicode61`) kept in
sync with `notes` via `AFTER INSERT/UPDATE/DELETE` triggers. The
`searchNotes()` helper sanitizes user input into a safe prefix query
(`"term"* AND …`) and returns ranked results with highlighted `snippet()`
fragments.

## Conventions

- Domain logic stays in the repository; views and stores never write raw SQL.
- New persistent data starts with a migration, never an ad-hoc runtime query.
- IDs are client-generated (`nanoid`); timestamps are epoch milliseconds.
