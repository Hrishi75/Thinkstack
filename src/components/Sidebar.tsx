import {
  FileText,
  CheckSquare,
  StickyNote,
  Search,
  Moon,
  Sun,
  Trash2,
  Plus,
} from "lucide-react";
import { useUI, type View } from "../store/ui";
import { useNotes } from "../store/notes";
import { useTasks } from "../store/tasks";
import { useSticky } from "../store/sticky";
import { cn } from "../lib/util";
import Logo from "./Logo";

const NAV: { key: View; label: string; icon: typeof FileText }[] = [
  { key: "notes", label: "Notes", icon: FileText },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "sticky", label: "Sticky", icon: StickyNote },
];

function NavButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition",
        active
          ? "bg-elevated font-medium text-text"
          : "text-muted hover:bg-elevated/60 hover:text-text"
      )}
    >
      <Icon size={16} className={active ? "text-text" : "text-muted"} />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] tabular-nums text-muted/80">{count}</span>
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

  const counts: Record<string, number> = {
    notes: noteCount,
    tasks: taskCount,
    sticky: stickyCount,
  };

  const newNote = async () => {
    await createNote();
    setView("notes");
  };

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-border/70 bg-surface">
      {/* macOS draggable title bar with traffic-light inset */}
      <div className="drag-region h-10 shrink-0" />

      <div className="px-2.5 pb-2">
        <div className="flex items-center gap-2 px-2 pb-2.5">
          <Logo size={24} />
          <span className="flex-1 text-[14px] font-semibold tracking-tight text-text">
            Thinkstack
          </span>
          <button
            onClick={newNote}
            className="no-drag rounded-md p-1 text-muted transition hover:bg-elevated hover:text-text"
            title="New note (⌘N)"
          >
            <Plus size={15} />
          </button>
        </div>

        <button
          onClick={() => setCommandOpen(true)}
          className="no-drag mb-2 flex w-full items-center gap-2 rounded-lg border border-border/80 bg-bg px-2.5 py-1.5 text-[13px] text-muted shadow-soft transition hover:border-border hover:text-text"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-muted dark:bg-white/[0.06]">
            ⌘K
          </kbd>
        </button>

        <nav className="flex flex-col gap-px">
          {NAV.map(({ key, label, icon }) => (
            <NavButton
              key={key}
              active={view === key}
              onClick={() => setView(key)}
              icon={icon}
              label={label}
              count={counts[key]}
            />
          ))}
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-px px-2.5 pb-1">
        <NavButton
          active={view === "trash"}
          onClick={() => setView("trash")}
          icon={Trash2}
          label="Trash"
          count={trashCount}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] text-muted/80">v0.1 · local</span>
        <button
          onClick={toggleTheme}
          className="rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </aside>
  );
}
