import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type AiProvider = "anthropic" | "openai" | "groq";

export const PROVIDERS: { key: AiProvider; label: string }[] = [
  { key: "anthropic", label: "Anthropic" },
  { key: "openai", label: "OpenAI" },
  { key: "groq", label: "Groq" },
];

/** Sensible defaults; the model field is free-text so users can pick any model. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
};

const PROVIDER_KEY = "thinkstack.ai.provider";
const modelKey = (p: AiProvider) => `thinkstack.ai.model.${p}`;

const SYSTEM_PROMPT =
  "You are the writing assistant inside Thinkstack, a notes app. " +
  "Follow the instruction precisely and return only the requested content — " +
  "no preamble, no closing remarks, and no markdown code fences unless asked.";

function storedProvider(): AiProvider {
  const p = localStorage.getItem(PROVIDER_KEY);
  return p === "openai" || p === "groq" ? p : "anthropic";
}

function storedModel(p: AiProvider): string {
  return localStorage.getItem(modelKey(p)) || DEFAULT_MODELS[p];
}

interface AiState {
  provider: AiProvider;
  model: string;
  /** Whether a key is stored in the OS keychain (the key itself never comes back). */
  hasKey: boolean;
  settingsOpen: boolean;
  init: () => Promise<void>;
  setProvider: (p: AiProvider) => Promise<void>;
  setModel: (m: string) => void;
  saveKey: (key: string) => Promise<void>;
  clearKey: () => Promise<void>;
  setSettingsOpen: (open: boolean) => void;
  /** Run one completion with the configured provider/model. Throws on failure. */
  complete: (prompt: string) => Promise<string>;
}

export const useAi = create<AiState>((set, get) => ({
  provider: storedProvider(),
  model: storedModel(storedProvider()),
  hasKey: false,
  settingsOpen: false,

  async init() {
    try {
      const hasKey = await invoke<boolean>("ai_has_key", {
        provider: get().provider,
      });
      set({ hasKey });
    } catch {
      set({ hasKey: false });
    }
  },

  async setProvider(provider) {
    localStorage.setItem(PROVIDER_KEY, provider);
    set({ provider, model: storedModel(provider) });
    await get().init();
  },

  setModel(model) {
    const trimmed = model.trim();
    localStorage.setItem(modelKey(get().provider), trimmed);
    set({ model });
  },

  async saveKey(key) {
    await invoke("ai_set_key", { provider: get().provider, key });
    set({ hasKey: true });
  },

  async clearKey() {
    await invoke("ai_clear_key", { provider: get().provider });
    set({ hasKey: false });
  },

  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },

  async complete(prompt) {
    const { provider, model } = get();
    return invoke<string>("ai_complete", {
      provider,
      model: model.trim() || DEFAULT_MODELS[provider],
      system: SYSTEM_PROMPT,
      prompt,
    });
  },
}));
