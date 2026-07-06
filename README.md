<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Thinkstack logo" width="96" />

# Thinkstack

**A fast, local-first desktop workspace for notes, tasks, and sticky notes.**

Your data never leaves your machine — everything lives in a local SQLite database.

</div>

---

## ✨ Features

### 📝 Notes
A block-based rich-text editor (BlockNote) for long-form thinking. Each note has a custom emoji icon, can be **pinned** to the top of the list, and **archived** when you're done with it. Pinned notes always sort first, followed by most recently edited.

### ✅ Tasks
A focused task list with **priorities** (none / low / medium / high), **due dates with an optional time** via a quick picker (Today / Tomorrow / Next week / custom date & time), and **drag-to-reorder**. Tasks are created through the **New task** dialog — title, free-form **description**, due date & time, and priority in one place, with a preview of exactly when the reminder will fire. A progress bar tracks completion, filters show live counts, and any task can be **linked to a note** — the note appears as a chip on the task and one click jumps to it.

### 🔔 Reminders
Tasks with a due date fire a **desktop notification** — at the task's due time if one is set, otherwise at 9:00 on the due day (each task notifies once; changing the date or time re-arms it). macOS will ask for notification permission the first time.

### ✨ AI Assistant (bring your own key)
Connect your own **Anthropic** or **OpenAI** API key in Settings and use AI right inside your notes: summarize, improve writing, fix grammar, continue writing, extract tasks (added straight to your task list), or ask anything about the current note. Your key is stored in the **system keychain**, requests go **directly from your device to the provider**, and nothing passes through any middleman — if no key is configured, the app makes no network requests at all.

### 🗒️ Sticky Notes
Lightweight sticky notes in six colors. Pop any sticky out into its own **frameless, always-on-top floating window** that stays visible over other apps — perfect for reminders and scratch thoughts. Position and size are remembered.

### 🔍 Search & Command Palette
A `⌘K` command palette with **instant full-text search** across every note, powered by SQLite FTS5 with highlighted snippets, plus **quick actions** — create a note or sticky, jump between views, or switch the theme without touching the mouse.

### 🗑️ Trash
Deleted notes move to a **Trash** in the sidebar instead of vanishing. Restore them with one click (or the **Undo** toast right after deleting), delete individual notes forever, or empty the whole trash.

### ⚡ Quick Capture
A global `⌘⇧Space` hotkey opens a centered capture bar from **anywhere on your system** — even when Thinkstack isn't focused — so a thought is never more than a keypress away.

### 🌗 Themes
Light and dark themes that follow your system preference and remember your manual choice.

### 🔒 Local-First
No cloud, no account, no telemetry. Everything is stored in a local SQLite database (WAL mode) on your machine.

## ⌨️ Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open the command palette / search |
| `⌘N` / `Ctrl+N` | Create a new note |
| `⌘1` … `⌘4` | Switch view (Notes / Tasks / Sticky / Trash) |
| `⌘⇧Space` | Toggle quick capture (works globally) |

## 📚 Documentation

- [**DEVELOPMENT.md**](DEVELOPMENT.md) — set up your environment, run, and build the app.
- [**ARCHITECTURE.md**](ARCHITECTURE.md) — how Thinkstack is structured and how data flows.
- [**CONTRIBUTING.md**](CONTRIBUTING.md) — workflow, conventions, and how to submit changes.

---

<div align="center">
<sub>Built by <a href="https://github.com/Hrishi75">Hrishi75</a></sub>
</div>
