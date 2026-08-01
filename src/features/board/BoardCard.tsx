import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke } from "@tauri-apps/api/core";
import {
  Boxes,
  Check,
  CheckSquare,
  FileText,
  Flag,
  Repeat,
  StickyNote,
} from "lucide-react";
import type { BoardCard as Card } from "../../store/board";
import { useUI } from "../../store/ui";
import { useNotes } from "../../store/notes";
import { useTasks } from "../../store/tasks";
import {
  STICKY_COLORS,
  WORKER_STATUS_STYLES,
  type BoardKind,
} from "../../lib/types";
import { PRIORITIES } from "../tasks/menus";
import { dueLabel } from "../../lib/dates";
import { cn, deriveTitle } from "../../lib/util";

const KIND_ICONS: Record<BoardKind, typeof FileText> = {
  task: CheckSquare,
  note: FileText,
  sticky: StickyNote,
  worker: Boxes,
};

/** Title and secondary line for a card, whatever domain it came from. */
function summarize(card: Card): { title: string; sub: string } {
  switch (card.kind) {
    case "task":
      return { title: card.task.title || "Untitled", sub: card.task.description };
    case "note":
      return {
        title: card.note.title || "Untitled",
        sub: card.note.body_text.slice(0, 120),
      };
    case "sticky": {
      const text = card.sticky.content.trim();
      if (!text) return { title: "Empty sticky", sub: "" };
      const title = deriveTitle(text);
      return { title, sub: text.slice(title.length).trim().slice(0, 120) };
    }
    case "worker": {
      const num = card.worker.source_number;
      const source = num ? `#${num}` : card.worker.source_kind;
      return {
        title: card.worker.title || card.worker.branch,
        sub: [card.worker.repo_label, source].filter(Boolean).join(" · "),
      };
    }
  }
}

/** Card body — shared by the sortable card and the drag overlay. */
function CardBody({ card }: { card: Card }) {
  const setView = useUI((s) => s.setView);
  const selectNote = useNotes((s) => s.select);
  const toggleTask = useTasks((s) => s.toggle);

  const { title, sub } = summarize(card);
  const KindIcon = KIND_ICONS[card.kind];
  const done = card.kind === "task" && !!card.task.done;

  const open = () => {
    switch (card.kind) {
      case "task":
        setView("tasks");
        break;
      case "note":
        selectNote(card.id);
        setView("notes");
        break;
      case "sticky":
        invoke("open_sticky", { id: card.id });
        break;
      case "worker":
        setView("orchestration");
        break;
    }
  };

  const priority =
    card.kind === "task" ? PRIORITIES[card.task.priority] ?? PRIORITIES[0] : null;
  const swatch = card.kind === "sticky" ? STICKY_COLORS[card.sticky.color] : null;

  return (
    <div
      onClick={open}
      className="flex cursor-pointer gap-2 rounded-lg border border-border/80 bg-surface p-2.5 shadow-soft transition hover:border-border"
    >
      {/* A sticky keeps its own color; every other card gets its domain icon. */}
      {swatch ? (
        <span
          className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] border border-black/10"
          style={{ background: swatch.bg }}
        />
      ) : card.kind === "task" ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTask(card.id);
          }}
          title={done ? "Mark as not done" : "Mark as done"}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition",
            done
              ? "border-accent bg-accent text-white"
              : "border-border hover:border-accent"
          )}
        >
          {done && <Check size={11} strokeWidth={3} />}
        </button>
      ) : (
        <KindIcon size={14} className="mt-0.5 shrink-0 text-muted" />
      )}

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] leading-snug",
            done && "text-muted line-through"
          )}
        >
          {card.kind === "note" && (
            <span className="mr-1">{card.note.icon}</span>
          )}
          {title}
        </div>

        {sub && (
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
            {sub}
          </div>
        )}

        {(card.kind === "task" || card.kind === "worker") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted">
            {card.kind === "task" && card.task.due_at !== null && (
              <span
                className={cn(
                  "rounded px-1 py-px",
                  !card.task.done && card.task.due_at < Date.now()
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : "bg-elevated"
                )}
              >
                {dueLabel(card.task.due_at, card.task.due_has_time)}
              </span>
            )}
            {card.kind === "task" && card.task.recur && (
              <Repeat size={10} className="opacity-70" />
            )}
            {card.kind === "task" && card.task.priority > 0 && priority && (
              <Flag size={10} className={cn(priority.cls, "fill-current")} />
            )}
            {/* A worker's real status shows wherever the card was parked. */}
            {card.kind === "worker" && (
              <span
                className={cn(
                  "rounded px-1 py-px",
                  WORKER_STATUS_STYLES[card.worker.status].pill
                )}
              >
                {WORKER_STATUS_STYLES[card.worker.status].label}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardCardOverlay({ card }: { card: Card }) {
  return (
    <div className="w-[248px] rotate-2 opacity-95">
      <CardBody card={card} />
    </div>
  );
}

export default function BoardCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.key });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <CardBody card={card} />
    </div>
  );
}
