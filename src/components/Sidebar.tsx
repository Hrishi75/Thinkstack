import { FileText, CheckSquare, StickyNote, Search, Moon, Sun } from "lucide-react";
import { useUI, type View } from "../store/ui";
import { cn } from "../lib/util";

const NAV: { key: View; label: string; icon: typeof FileText }[] = [
  { key: "notes", label: "Notes", icon: FileText },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "sticky", label: "Sticky", icon: StickyNote },
];

export default function Sidebar() {
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const setCommandOpen = useUI((s) => s.setCommandOpen);

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-border/70 bg-surface">
      {/* macOS draggable title bar with traffic-light inset */}
      <div className="drag-region h-10 shrink-0" />

      <div className="px-2.5 pb-2">
        <div className="flex items-center gap-2 px-2 pb-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/90 text-[13px]">
            🧠
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-text">
            Thinkstack
          </span>
        </div>

        <button
          onClick={() => setCommandOpen(true)}
          className="no-drag mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] text-muted transition hover:bg-elevated"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-muted dark:bg-white/[0.06]">
            ⌘K
          </kbd>
        </button>

        <nav className="flex flex-col gap-px">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition",
                view === key
                  ? "bg-elevated font-medium text-text"
                  : "text-muted hover:bg-elevated/60 hover:text-text"
              )}
            >
              <Icon
                size={16}
                className={view === key ? "text-text" : "text-muted"}
              />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto flex items-center justify-between px-3 py-2.5">
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
