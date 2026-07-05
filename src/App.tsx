import { useEffect } from "react";
import { motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { useUI } from "./store/ui";
import { useNotes } from "./store/notes";
import { useTasks } from "./store/tasks";
import { useSticky } from "./store/sticky";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import NotesView from "./features/notes/NotesView";
import TasksView from "./features/tasks/TasksView";
import StickyView from "./features/sticky/StickyView";
import TrashView from "./features/trash/TrashView";
import CommandPalette from "./features/search/CommandPalette";

export default function App() {
  const view = useUI((s) => s.view);
  const setCommandOpen = useUI((s) => s.setCommandOpen);

  const loadNotes = useNotes((s) => s.load);
  const loadTrash = useNotes((s) => s.loadTrash);
  const loadTasks = useTasks((s) => s.load);
  const loadSticky = useSticky((s) => s.load);

  useEffect(() => {
    loadNotes();
    loadTrash();
    loadTasks();
    loadSticky();
  }, [loadNotes, loadTrash, loadTasks, loadSticky]);

  // Live-refresh when another window (quick capture, sticky) writes data.
  useEffect(() => {
    const unlisten = listen("thinkstack://refresh", () => {
      loadNotes();
      loadTasks();
      loadSticky();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadNotes, loadTasks, loadSticky]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  return (
    <div className="flex h-full w-full bg-bg text-text">
      <Sidebar />
      <main className="relative flex-1 overflow-hidden">
        {/* Entrance-only fade keyed by view: instant switch, no exit delay. */}
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="h-full"
        >
          {view === "notes" && <NotesView />}
          {view === "tasks" && <TasksView />}
          {view === "sticky" && <StickyView />}
          {view === "trash" && <TrashView />}
        </motion.div>
      </main>
      <CommandPalette />
      <Toast />
    </div>
  );
}
