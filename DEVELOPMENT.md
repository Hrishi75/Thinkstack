# Development

This guide covers setting up Thinkstack locally, running it in development, and producing a build.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Platform-specific [Tauri system dependencies](https://tauri.app/start/prerequisites/)
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`)
  - **Linux** — `webkit2gtk`, `librsvg`, `build-essential`, etc. (see the Tauri docs)
  - **Windows** — Microsoft C++ Build Tools and the WebView2 runtime

## Setup

```bash
git clone https://github.com/Hrishi75/Thinkstack.git
cd Thinkstack
npm install
```

## Tech Stack

| Layer | Tools |
|-------|-------|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| UI | [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org/), [Vite 7](https://vite.dev) |
| Styling | [Tailwind CSS](https://tailwindcss.com), [Motion](https://motion.dev) |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Editor | [BlockNote](https://www.blocknotejs.org/) |
| Storage | SQLite via [`tauri-plugin-sql`](https://github.com/tauri-apps/plugins-workspace) + FTS5 |
| Interactions | [dnd-kit](https://dndkit.com), [react-virtual](https://tanstack.com/virtual) |

## Running

Launch the full desktop app (Rust backend + Vite dev server with hot reload):

```bash
npm run tauri dev
```

To work on the web UI alone (no native window) you can run Vite directly, though
features that depend on Tauri APIs (SQL, windows, global shortcuts) won't work:

```bash
npm run dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server (web only) |
| `npm run build` | Type-check (`tsc`) and build the web assets |
| `npm run preview` | Preview the built web assets |
| `npm run tauri dev` | Run the desktop app in development |
| `npm run tauri build` | Build a distributable desktop app |

## Building a Release

```bash
npm run tauri build
```

The bundled installer/binary is written to `src-tauri/target/release/` (and the
platform-specific `bundle/` subdirectory).

## Database

The app stores data in a local SQLite database named `thinkstack.db`, created in
the Tauri app data directory on first run. Schema changes are made through
versioned migrations in [`src-tauri/migrations/`](src-tauri/migrations/) and
registered in [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs). To add a migration:

1. Create a new numbered file, e.g. `0003_my_change.sql`.
2. Append a new `Migration` entry (with the next `version`) to the `migrations`
   vector in `lib.rs`.

Migrations run automatically on startup; never edit an already-shipped migration.

## Troubleshooting

- **Rust/Tauri build errors** — confirm the system dependencies above are installed and your toolchain is up to date (`rustup update`).
- **Stale database after a schema change** — delete the local `thinkstack.db` to recreate it from scratch (this erases local data).
