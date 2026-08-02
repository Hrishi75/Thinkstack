import {
  LayoutGrid,
  FileText,
  CheckSquare,
  CalendarDays,
  StickyNote,
  Brain,
  Boxes,
  Search,
  Moon,
  Sun,
  Trash2,
  Plus,
  Settings2,
} from "lucide-react";
import { useUI, type View } from "../store/ui";
import { useNotes } from "../store/notes";
import { useTasks } from "../store/tasks";
import { useSticky } from "../store/sticky";
import { useMemory } from "../store/memory";
import { useOrchestrator } from "../store/orchestrator";
import { useAi } from "../store/ai";
import { cn } from "../lib/util";
import Logo from "./Logo";
import NotificationCenter from "./NotificationCenter";
import { Kbd } from "./ui";

const NAV: { key: View; label: string; icon: typeof FileText; hint: string }[] = [
  { key: "board", label: "Board", icon: LayoutGrid, hint: "⌘1" },
  { key: "notes", label: "Notes", icon: FileText, hint: "⌘2" },
  { key: "tasks", label: "Tasks", icon: CheckSquare, hint: "⌘3" },
  { key: "calendar", label: "Calendar", icon: CalendarDays, hint: "⌘4" },
  { key: "sticky", label: "Sticky", icon: StickyNote, hint: "⌘5" },
  { key: "memory", label: "Memory", icon: Brain, hint: "⌘6" },
  { key: "orchestration", label: "Orchestration", icon: Boxes, hint: "⌘7" },
];

function NavButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
  count?: number;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex h-[30px] items-center gap-2 rounded-md px-2 text-[13px] transition",
        active
          ? "bg-elevated font-medium text-text"
          : "text-muted hover:bg-elevated/60 hover:text-text"
      )}
    >
      <Icon
        size={15}
        className={cn("shrink-0", active ? "text-text" : "text-muted/80")}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {/* Hovering a row teaches its shortcut; the count returns on mouse-out. */}
      {hint && <Kbd className="hidden group-hover:inline-block">{hint}</Kbd>}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[11px] tabular-nums text-muted/70",
            hint && "group-hover:hidden"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function Sidebar() {
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const setCommandOpen = useUI((s) => s.setCommandOpen);

  const noteCount = useNotes((s) => s.notes.length);
  const trashCount = useNotes((s) => s.trashed.length);
  const createNote = useNotes((s) => s.create);
  const taskCount = useTasks((s) => s.tasks.filter((t) => !t.done).length);
  const stickyCount = useSticky((s) => s.stickies.length);
  const memoryCount = useMemory((s) => s.memories.filter((m) => m.enabled === 1).length);
  const activeWorkers = useOrchestrator(
    (s) => s.workers.filter((w) => w.status === "running" || w.status === "review").length
  );

  const counts: Record<string, number> = {
    notes: noteCount,
    tasks: taskCount,
    sticky: stickyCount,
    memory: memoryCount,
    orchestration: activeWorkers,
  };

  const newNote = async () => {
    await createNote();
    setView("notes");
  };

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border/70 bg-surface">
      {/* macOS draggable title bar with traffic-light inset */}
      <div className="drag-region h-10 shrink-0" />

      <div className="px-2.5 pb-2">
        <div className="flex items-center gap-2 px-1.5 pb-2.5">
          <Logo size={22} />
          <span className="flex-1 truncate text-[13px] font-semibold tracking-tight text-text">
            Thinkstack
          </span>
          <div className="no-drag flex items-center">
            <NotificationCenter align="left" />
            <button
              onClick={newNote}
              className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
              title="New note (⌘N)"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        <button
          onClick={() => setCommandOpen(true)}
          className="no-drag mb-3 flex h-8 w-full items-center gap-2 rounded-lg border border-border/80 bg-bg px-2.5 text-[12.5px] text-muted shadow-soft transition hover:border-border hover:text-text"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ key, label, icon, hint }) => (
            <NavButton
              key={key}
              active={view === key}
              onClick={() => setView(key)}
              icon={icon}
              label={label}
              count={counts[key]}
              hint={hint}
            />
          ))}
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-0.5 px-2.5 pb-1.5">
        <NavButton
          active={view === "trash"}
          onClick={() => setView("trash")}
          icon={Trash2}
          label="Trash"
          count={trashCount}
          hint="⌘8"
        />
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
        <span className="text-[10.5px] text-muted/70">v0.2 · local</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => useAi.getState().setSettingsOpen(true)}
            className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
            title="Settings"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
