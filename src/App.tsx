import { useEffect } from "react";
import { motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { useUI, type View } from "./store/ui";
import { useNotes } from "./store/notes";
import { useTasks } from "./store/tasks";
import { useSticky } from "./store/sticky";
import { useCalendar } from "./store/calendar";
import { useAi } from "./store/ai";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import SettingsModal from "./components/SettingsModal";
import NotesView from "./features/notes/NotesView";
import TasksView from "./features/tasks/TasksView";
import CalendarView from "./features/calendar/CalendarView";
import StickyView from "./features/sticky/StickyView";
import TrashView from "./features/trash/TrashView";
import CommandPalette from "./features/search/CommandPalette";

const VIEW_KEYS: Record<string, View> = {
  "1": "notes",
  "2": "tasks",
  "3": "calendar",
  "4": "sticky",
  "5": "trash",
};

export default function App() {
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const setCommandOpen = useUI((s) => s.setCommandOpen);

  const loadNotes = useNotes((s) => s.load);
  const loadTrash = useNotes((s) => s.loadTrash);
  const createNote = useNotes((s) => s.create);
  const loadTasks = useTasks((s) => s.load);
  const notifyDue = useTasks((s) => s.notifyDue);
  const loadSticky = useSticky((s) => s.load);
  const loadMarks = useCalendar((s) => s.load);
  const initAi = useAi((s) => s.init);

  useEffect(() => {
    loadNotes();
    loadTrash();
    loadTasks();
    loadSticky();
    loadMarks();
    initAi();
  }, [loadNotes, loadTrash, loadTasks, loadSticky, loadMarks, initAi]);

  // Due-task reminders: check shortly after launch (once tasks are loaded),
  // then once a minute while the app is running.
  useEffect(() => {
    const first = setTimeout(notifyDue, 3_000);
    const timer = setInterval(notifyDue, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [notifyDue]);

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
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      } else if (key === "n" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        createNote().then(() => setView("notes"));
      } else if (VIEW_KEYS[key] && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setView(VIEW_KEYS[key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen, setView, createNote]);

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
          {view === "calendar" && <CalendarView />}
          {view === "sticky" && <StickyView />}
          {view === "trash" && <TrashView />}
        </motion.div>
      </main>
      <CommandPalette />
      <SettingsModal />
      <Toast />
    </div>
  );
}
