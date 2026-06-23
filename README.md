<div align="center">

# 🧠 Thinkstack

**A fast, local-first desktop workspace for notes, tasks, and sticky notes.**

Built with Tauri 2, React 19, and SQLite — your data never leaves your machine.

</div>

---

## ✨ Features

- 📝 **Rich notes** — block-based editor (BlockNote) with custom icons, pinning, and archiving.
- ✅ **Tasks** — priorities, due dates, drag-to-reorder, and optional links back to notes.
- 🗒️ **Sticky notes** — pop them out into frameless, always-on-top floating windows in six colors.
- 🔍 **Instant search** — SQLite FTS5 full-text search across every note, with a `⌘K` command palette.
- ⚡ **Quick capture** — a global `⌘⇧Space` hotkey opens a centered capture bar from anywhere.
- 🌗 **Light & dark themes** — follows your system preference and remembers your choice.
- 🔒 **Local-first** — everything is stored in a local SQLite database (WAL mode). No cloud, no account.

## 🛠️ Tech Stack

| Layer | Tools |
|-------|-------|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| UI | [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org/), [Vite 7](https://vite.dev) |
| Styling | [Tailwind CSS](https://tailwindcss.com), [Motion](https://motion.dev) |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Editor | [BlockNote](https://www.blocknotejs.org/) |
| Storage | SQLite via [`tauri-plugin-sql`](https://github.com/tauri-apps/plugins-workspace) + FTS5 |
| Interactions | [dnd-kit](https://dndkit.com), [react-virtual](https://tanstack.com/virtual) |

## ⌨️ Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open the command palette / search |
| `⌘⇧Space` | Toggle quick capture (works globally) |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable) and the [Tauri system dependencies](https://tauri.app/start/prerequisites/)

### Install & run

```bash
# install dependencies
npm install

# run the desktop app in development
npm run tauri dev
```

### Build a production app

```bash
npm run tauri build
```

The installer/binary is produced under `src-tauri/target/release/`.

## 📁 Project Structure

```
src/
├── components/      shared UI (Sidebar)
├── features/        feature modules
│   ├── notes/       notes list + BlockNote editor
│   ├── tasks/       task list + items
│   ├── sticky/      sticky-note board
│   └── search/      command palette
├── windows/         standalone windows (sticky, quick capture)
├── store/           Zustand stores (notes, tasks, sticky, ui)
├── lib/             db, repository, types, utils
└── styles/          global styles

src-tauri/
├── src/             Rust entry + window/command logic
├── migrations/      SQLite schema migrations
└── tauri.conf.json  Tauri configuration
```

## 🗄️ Data

Notes, tasks, and sticky notes live in a single SQLite database (`thinkstack.db`) managed through versioned migrations. Notes are mirrored into an FTS5 virtual table via triggers to keep search instant.

---

<div align="center">
<sub>Built by <a href="https://github.com/Hrishi75">Hrishi75</a></sub>
</div>
