import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { useUI } from "./store/ui";
import { useNotes } from "./store/notes";
import { useTasks } from "./store/tasks";
import { useSticky } from "./store/sticky";
import Sidebar from "./components/Sidebar";
import NotesView from "./features/notes/NotesView";
import TasksView from "./features/tasks/TasksView";
import StickyView from "./features/sticky/StickyView";
import CommandPalette from "./features/search/CommandPalette";

export default function App() {
  const view = useUI((s) => s.view);
  const setCommandOpen = useUI((s) => s.setCommandOpen);

  const loadNotes = useNotes((s) => s.load);
  const loadTasks = useTasks((s) => s.load);
  const loadSticky = useSticky((s) => s.load);

  useEffect(() => {
    loadNotes();
    loadTasks();
    loadSticky();
  }, [loadNotes, loadTasks, loadSticky]);

  // Live-refresh when another window (quick capture) writes data.
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
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="h-full"
          >
            {view === "notes" && <NotesView />}
            {view === "tasks" && <TasksView />}
            {view === "sticky" && <StickyView />}
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandPalette />
    </div>
  );
}
