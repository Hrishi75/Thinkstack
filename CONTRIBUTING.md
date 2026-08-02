# Contributing

Thanks for your interest in improving Thinkstack! This document explains how to
get set up and the conventions to follow when submitting changes.

## Getting Started

1. Read [DEVELOPMENT.md](DEVELOPMENT.md) to set up your environment and run the app.
2. Skim [ARCHITECTURE.md](ARCHITECTURE.md) to understand how the project is organized.
3. Fork the repository and create a branch for your change.

## Workflow

1. **Open an issue first** for anything non-trivial so the approach can be
   discussed before you invest time in it.
2. **Create a branch** off `main` with a descriptive name:
   - `feat/sticky-resize`
   - `fix/search-empty-query`
   - `docs/architecture-diagram`
3. **Make focused commits** — small, logical changes are easier to review than
   one large commit.
4. **Open a pull request** against `main` with a clear description of what and why.

## Commit Messages

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/)
style:

```
<type>: <short summary>
```

Common types:

| Type | Use for |
|------|---------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Tooling, config, dependencies |
| `style` | Formatting / non-functional changes |

Keep the summary in the imperative mood and under ~72 characters, e.g.
`feat: add due-date filter to task list`.

## Code Style

- **TypeScript** throughout the frontend; prefer explicit types for exported APIs.
- **Keep the data flow intact** — UI → store → repository → database. Don't write
  SQL in components or stores; add queries to `src/lib/repo.ts`.
- **New persistent data needs a migration** — add a numbered file in
  `src-tauri/migrations/` and register it in `src-tauri/src/lib.rs`. Never edit a
  migration that has already shipped.
- Match the existing formatting, naming, and structure of nearby code.

### Touching the Database

Everything the user owns lives in one local SQLite file with no server and no
backup, so writes get held to a few rules:

- **Parameterize every query.** Values go in as `?` bindings. Where a column
  name has to be interpolated (`setClause`), it comes from an allowlist — never
  from a caller's object keys.
- **Validate at the repository boundary**, not at the call sites. Coerce enum
  columns with a `to…()` helper (`toBoardStage`, `toNotificationKind`) and clamp
  free text that has no natural length limit — worker output and error strings
  are unbounded, and these rows are kept indefinitely.
- **Optimistic updates must roll back.** Stores paint before they store; if the
  write throws, put the previous state back rather than leaving the UI
  disagreeing with the table until the next launch.
- **A failed write must not break the app.** Catch it, log it, degrade. Nothing
  in a secondary feature is worth taking the workspace down for.
- **Bound anything that grows on its own.** Append-only tables need a cap
  enforced on the write path, not only on load.
- **Destructive actions confirm.** Use `ConfirmButton` for anything that deletes
  rows the user can't get back.
- **Cross-table links have no foreign keys** (cards and notifications point at
  four different tables). Prune or disarm the dangling ones on load, the way
  `boardRepo.prune()` does.

## Before You Open a PR

- [ ] `npm run build` passes (type-check + build).
- [ ] The app runs with `npm run tauri dev` and your change works as intended.
- [ ] Commits are clean and follow the message convention.
- [ ] Docs are updated if behavior, setup, or architecture changed.

## Reporting Bugs

Open an issue including:

- What you expected to happen and what actually happened
- Steps to reproduce
- Your OS and app version
- Relevant logs or screenshots

## Suggesting Features

Open an issue describing the problem you're trying to solve (not just the
solution). Context about your use case helps shape the right design.
