import { create } from "zustand";

export type View = "notes" | "tasks" | "sticky";
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

interface UIState {
  view: View;
  theme: Theme;
  commandOpen: boolean;
  setView: (v: View) => void;
  toggleTheme: () => void;
  setCommandOpen: (open: boolean) => void;
}

export const useUI = create<UIState>((set, get) => ({
  view: "notes",
  theme: initialTheme(),
  commandOpen: false,
  setView: (view) => set({ view }),
  toggleTheme: () => {
    const theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));

// apply on module load
applyTheme(useUI.getState().theme);
