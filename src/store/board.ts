import { useMemo } from "react";
import { create } from "zustand";
import type {
  BoardKind,
  BoardPlacement,
  BoardStage,
  Note,
  Sticky,
  Task,
  Worker,
} from "../lib/types";
import { BOARD_KINDS } from "../lib/types";
import { boardRepo } from "../lib/repo";
import { now } from "../lib/db";
import { useNotes } from "./notes";
import { useTasks } from "./tasks";
import { useSticky } from "./sticky";
import { useOrchestrator } from "./orchestrator";

const KINDS_KEY = "thinkstack.board.kinds";

interface BoardCardBase {
  /** `${kind}:${id}` — unique across domains, and the dnd-kit item id. */
  key: string;
  id: string;
  stage: BoardStage;
  /** Order within the column; only meaningful when `placed`. */
  position: number;
  /** True once the user has dragged the card, i.e. it has a saved placement. */
  placed: boolean;
  /** Fallback ordering for unplaced cards — newest first. */
  sortKey: number;
}

/** One item on the board, carrying the row it came from. */
export type BoardCard = BoardCardBase &
  (
    | { kind: "task"; task: Task }
    | { kind: "note"; note: Note }
    | { kind: "sticky"; sticky: Sticky }
    | { kind: "worker"; worker: Worker }
  );

export type BoardColumns = Record<BoardStage, BoardCard[]>;

/** Omit that distributes over a union instead of collapsing it to common keys. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A card before its column has been resolved. */
type UnplacedCard = OmitEach<BoardCard, "stage" | "position" | "placed">;

export function cardKey(kind: BoardKind, id: string): string {
  return `${kind}:${id}`;
}

function parseKey(key: string): { kind: BoardKind; id: string } {
  const at = key.indexOf(":");
  return { kind: key.slice(0, at) as BoardKind, id: key.slice(at + 1) };
}

/* --------------------- Default stage per domain --------------------- */
// Where an item sits before anyone has dragged it. The point is that the
// board is useful on first open rather than one big Backlog column.

function taskStage(t: Task): BoardStage {
  if (t.done) return "done";
  return t.due_at !== null ? "todo" : "backlog";
}

function noteStage(n: Note): BoardStage {
  return n.pinned ? "todo" : "backlog";
}

function workerStage(w: Worker): BoardStage {
  if (w.status === "running" || w.status === "review") return "doing";
  if (w.status === "approved") return "done";
  return "todo"; // failed / stopped — needs a decision
}

/**
 * A task's checkbox is the authority on Done: completing it anywhere in the
 * app moves the card, and a stale "done" placement left over from before the
 * task was re-opened never outranks it.
 */
function resolveTaskStage(t: Task, p: BoardPlacement | undefined): BoardStage {
  if (t.done) return "done";
  return p && p.stage !== "done" ? p.stage : taskStage(t);
}

interface BoardState {
  /** `${kind}:${id}` → placement, for items the user has arranged. */
  placements: Record<string, BoardPlacement>;
  loaded: boolean;
  /** Which domains are shown; toggled from the filter bar. */
  kinds: Record<BoardKind, boolean>;
  load: () => Promise<void>;
  toggleKind: (kind: BoardKind) => void;
  /**
   * Drop `card` into `stage`. `orderedKeys` is the target column's full order
   * after the move — every card in it gets an explicit placement, so the
   * arrangement the user sees is exactly what's stored.
   */
  move: (
    card: BoardCard,
    stage: BoardStage,
    orderedKeys: string[]
  ) => Promise<void>;
  /** Create a task straight into a column, pinned to the top of it. */
  addTask: (title: string, stage: BoardStage) => Promise<void>;
}

function initialKinds(): Record<BoardKind, boolean> {
  const all = Object.fromEntries(
    BOARD_KINDS.map((k) => [k.key, true])
  ) as Record<BoardKind, boolean>;
  try {
    const stored = JSON.parse(localStorage.getItem(KINDS_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      for (const { key } of BOARD_KINDS) {
        if (stored[key] === false) all[key] = false;
      }
    }
  } catch {
    // malformed preference; fall back to showing everything
  }
  return all;
}

export const useBoard = create<BoardState>((set, get) => ({
  placements: {},
  loaded: false,
  kinds: initialKinds(),

  async load() {
    await boardRepo.prune();
    const rows = await boardRepo.list();
    const placements: Record<string, BoardPlacement> = {};
    for (const row of rows) placements[cardKey(row.kind, row.item_id)] = row;
    set({ placements, loaded: true });
  },

  toggleKind(kind) {
    const kinds = { ...get().kinds, [kind]: !get().kinds[kind] };
    localStorage.setItem(KINDS_KEY, JSON.stringify(kinds));
    set({ kinds });
  },

  async move(card, stage, orderedKeys) {
    const ts = now();
    const rows: BoardPlacement[] = orderedKeys.map((key, i) => {
      const { kind, id } = parseKey(key);
      return { kind, item_id: id, stage, position: i, updated_at: ts };
    });

    set((s) => {
      const placements = { ...s.placements };
      for (const row of rows) placements[cardKey(row.kind, row.item_id)] = row;
      return { placements };
    });

    // Dropping a task into Done completes it; dragging it out re-opens it.
    if (card.kind === "task") {
      const done = stage === "done" ? 1 : 0;
      if (card.task.done !== done) {
        await useTasks.getState().update(card.id, { done });
      }
    }

    await Promise.all(rows.map((row) => boardRepo.place(row)));
  },

  async addTask(title, stage) {
    const id = await useTasks.getState().add(title);
    if (!id) return;
    if (stage === "done") await useTasks.getState().update(id, { done: 1 });

    // Sort above whatever is already in the column, like a new task does in
    // the task list. Positions get renumbered on the next drag anyway.
    const top = Math.min(
      0,
      ...Object.values(get().placements)
        .filter((p) => p.stage === stage)
        .map((p) => p.position)
    );
    const row: BoardPlacement = {
      kind: "task",
      item_id: id,
      stage,
      position: top - 1,
      updated_at: now(),
    };
    set((s) => ({
      placements: { ...s.placements, [cardKey("task", id)]: row },
    }));
    await boardRepo.place(row);
  },
}));

/**
 * Every item in the app, grouped into columns. Cards the user has arranged
 * come first in their saved order; the rest follow, newest first.
 */
export function useBoardCards(): BoardColumns {
  const placements = useBoard((s) => s.placements);
  const kinds = useBoard((s) => s.kinds);
  const tasks = useTasks((s) => s.tasks);
  const notes = useNotes((s) => s.notes);
  const stickies = useSticky((s) => s.stickies);
  const workers = useOrchestrator((s) => s.workers);

  return useMemo(() => {
    const columns: BoardColumns = { backlog: [], todo: [], doing: [], done: [] };

    const push = (
      card: UnplacedCard,
      fallback: BoardStage,
      resolve?: (p: BoardPlacement | undefined) => BoardStage
    ) => {
      const placement = placements[card.key];
      const stage = resolve
        ? resolve(placement)
        : placement?.stage ?? fallback;
      // A placement only orders the column it actually points at; a card the
      // checkbox pulled elsewhere sorts with the unplaced ones.
      const placed = !!placement && placement.stage === stage;
      columns[stage].push({
        ...card,
        stage,
        placed,
        position: placed ? placement.position : 0,
      } as BoardCard);
    };

    if (kinds.task) {
      for (const task of tasks) {
        push(
          {
            key: cardKey("task", task.id),
            id: task.id,
            kind: "task",
            task,
            sortKey: task.created_at,
          },
          taskStage(task),
          (p) => resolveTaskStage(task, p)
        );
      }
    }
    if (kinds.note) {
      for (const note of notes) {
        push(
          {
            key: cardKey("note", note.id),
            id: note.id,
            kind: "note",
            note,
            sortKey: note.updated_at,
          },
          noteStage(note)
        );
      }
    }
    if (kinds.sticky) {
      for (const sticky of stickies) {
        push(
          {
            key: cardKey("sticky", sticky.id),
            id: sticky.id,
            kind: "sticky",
            sticky,
            sortKey: sticky.updated_at,
          },
          "backlog"
        );
      }
    }
    if (kinds.worker) {
      for (const worker of workers) {
        push(
          {
            key: cardKey("worker", worker.id),
            id: worker.id,
            kind: "worker",
            worker,
            sortKey: worker.updated_at,
          },
          workerStage(worker)
        );
      }
    }

    for (const stage of Object.keys(columns) as BoardStage[]) {
      columns[stage].sort(
        (a, b) =>
          Number(b.placed) - Number(a.placed) ||
          (a.placed ? a.position - b.position : b.sortKey - a.sortKey)
      );
    }
    return columns;
  }, [placements, kinds, tasks, notes, stickies, workers]);
}
