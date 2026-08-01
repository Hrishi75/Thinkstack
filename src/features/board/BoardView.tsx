import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { LayoutGrid, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useBoard,
  useBoardCards,
  type BoardCard as Card,
} from "../../store/board";
import { BOARD_KINDS, BOARD_STAGES, type BoardStage } from "../../lib/types";
import { cn } from "../../lib/util";
import BoardCard, { BoardCardOverlay } from "./BoardCard";

/** Droppable id for a column, kept distinct from card keys (`kind:id`). */
const stageId = (stage: BoardStage) => `stage:${stage}`;
const isStageId = (id: string) => id.startsWith("stage:");
const toStage = (id: string) => id.slice("stage:".length) as BoardStage;

function QuickAdd({ stage }: { stage: BoardStage }) {
  const addTask = useBoard((s) => s.addTask);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const submit = async () => {
    const value = title.trim();
    if (!value) return setOpen(false);
    await addTask(value, stage);
    setTitle("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted transition hover:bg-elevated hover:text-text"
      >
        <Plus size={13} /> Add task
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-1.5 shadow-soft">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        placeholder="Task title…"
        className="w-full bg-transparent px-1 py-0.5 text-[13px] outline-none placeholder:text-muted/70"
      />
      <div className="mt-1 flex items-center gap-1">
        <button
          onClick={submit}
          className="rounded-md bg-accent px-2 py-1 text-[11.5px] font-medium text-white transition hover:opacity-90"
        >
          Add
        </button>
        <button
          onClick={() => {
            setTitle("");
            setOpen(false);
          }}
          className="rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
          title="Cancel"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function Column({
  stage,
  label,
  dot,
  cards,
  over,
}: {
  stage: BoardStage;
  label: string;
  dot: string;
  cards: Card[];
  over: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stageId(stage) });

  return (
    <div className="flex h-full w-[276px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="text-[11px] tabular-nums text-muted/80">
          {cards.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl border border-dashed p-1.5 transition",
          over ? "border-accent/60 bg-accent/[0.06]" : "border-border/60"
        )}
      >
        <SortableContext
          items={cards.map((c) => c.key)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence initial={false}>
            {cards.map((card) => (
              <motion.div
                key={card.key}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <BoardCard card={card} />
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>

        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6 text-[11.5px] text-muted/70">
            Drop anything here
          </div>
        )}

        <div className="mt-auto pt-0.5">
          <QuickAdd stage={stage} />
        </div>
      </div>
    </div>
  );
}

export default function BoardView() {
  const columns = useBoardCards();
  const kinds = useBoard((s) => s.kinds);
  const toggleKind = useBoard((s) => s.toggleKind);
  const move = useBoard((s) => s.move);

  const [active, setActive] = useState<Card | null>(null);
  const [overStage, setOverStage] = useState<BoardStage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const findCard = (key: string): Card | undefined =>
    (Object.values(columns) as Card[][]).flat().find((c) => c.key === key);

  /** Column an `over` id belongs to — it may be a card or the column itself. */
  const stageOf = (overId: string): BoardStage | null =>
    isStageId(overId) ? toStage(overId) : findCard(overId)?.stage ?? null;

  const onDragStart = (e: DragStartEvent) => {
    setActive(findCard(String(e.active.id)) ?? null);
  };

  const onDragOver = (e: DragOverEvent) => {
    setOverStage(e.over ? stageOf(String(e.over.id)) : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active: dragged, over } = e;
    setActive(null);
    setOverStage(null);
    if (!over) return;

    const card = findCard(String(dragged.id));
    if (!card) return;
    const overId = String(over.id);
    const target = stageOf(overId);
    if (!target) return;

    if (target === card.stage) {
      const keys = columns[card.stage].map((c) => c.key);
      const from = keys.indexOf(card.key);
      const to = isStageId(overId) ? keys.length - 1 : keys.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return;
      move(card, target, arrayMove(keys, from, to));
      return;
    }

    // Across columns: land where the cursor is, or at the end of the column.
    const keys = columns[target].map((c) => c.key);
    const idx = isStageId(overId) ? -1 : keys.indexOf(overId);
    const at = idx === -1 ? keys.length : idx;
    move(card, target, [...keys.slice(0, at), card.key, ...keys.slice(at)]);
  };

  const total = (Object.values(columns) as Card[][]).reduce(
    (n, list) => n + list.length,
    0
  );
  const anyKind = BOARD_KINDS.some((k) => kinds[k.key]);

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-11 items-center px-6" />

      <div className="flex items-center justify-between px-6 pb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold">Board</h2>
          <span className="text-sm text-muted">
            {total === 1 ? "1 card" : `${total} cards`}
          </span>
        </div>

        {/* Which domains contribute cards; the choice sticks between sessions. */}
        <div className="no-drag flex items-center gap-1">
          {BOARD_KINDS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleKind(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12.5px] transition",
                kinds[key]
                  ? "bg-elevated font-medium text-text"
                  : "text-muted/70 hover:bg-elevated/60 hover:text-text"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!anyKind ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
          <LayoutGrid size={28} className="opacity-40" />
          <p>Everything is filtered out.</p>
          <p className="text-xs text-muted/70">
            Turn a filter back on to see your cards.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActive(null);
            setOverStage(null);
          }}
        >
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-6">
            {BOARD_STAGES.map(({ key, label, dot }) => (
              <Column
                key={key}
                stage={key}
                label={label}
                dot={dot}
                cards={columns[key]}
                over={overStage === key}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {active && <BoardCardOverlay card={active} />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
