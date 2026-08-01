import { create } from "zustand";

export type View =
  | "board"
  | "notes"
  | "tasks"
  | "calendar"
  | "sticky"
  | "memory"
  | "orchestration"
  | "trash";
type Theme = "light" | "dark";

const THEME_KEY = "thinkstack.theme";

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** A transient bottom-center notification, optionally with one action (e.g. Undo). */
export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

let toastSeq = 0;

interface UIState {
  view: View;
  theme: Theme;
  commandOpen: boolean;
  toast: Toast | null;
  setView: (v: View) => void;
  toggleTheme: () => void;
  setCommandOpen: (open: boolean) => void;
  showToast: (message: string, action?: { label: string; run: () => void }) => void;
  dismissToast: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  view: "notes",
  theme: initialTheme(),
  commandOpen: false,
  toast: null,
  setView: (view) => set({ view }),
  toggleTheme: () => {
    const theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  showToast: (message, action) =>
    set({
      toast: {
        id: ++toastSeq,
        message,
        actionLabel: action?.label,
        onAction: action?.run,
      },
    }),
  dismissToast: () => set({ toast: null }),
}));

// apply on module load
applyTheme(useUI.getState().theme);
