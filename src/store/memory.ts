import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  MEMORY_CATEGORIES,
  toMemoryCategory,
  type Memory,
  type MemoryCategory,
} from "../lib/types";
import { memoriesRepo } from "../lib/repo";
import { now } from "../lib/db";

/**
 * Hard ceiling on the context block. Memories are meant to be a page of
 * standing facts, not a document store — past this we truncate rather than
 * quietly blow up the user's token bill on every request.
 */
export const MEMORY_CONTEXT_LIMIT = 12_000;

/** Order categories appear in the context block, most general first. */
const CATEGORY_ORDER: MemoryCategory[] = [
  "company",
  "product",
  "people",
  "projects",
  "style",
  "general",
];

/**
 * Render enabled memories as the block prepended to the AI system prompt.
 * Returns "" when there's nothing to say, so callers can skip it entirely.
 */
export function buildMemoryContext(memories: Memory[]): string {
  const active = memories.filter(
    (m) => m.enabled === 1 && m.content.trim().length > 0
  );
  if (!active.length) return "";

  const lines: string[] = [
    "## Workspace memory",
    "",
    "Standing context about this user and their work. Treat it as background truth",
    "for every request and follow any preferences it states. Don't repeat it back or",
    "mention it unless it is relevant to the answer.",
  ];

  for (const category of CATEGORY_ORDER) {
    const inCategory = active.filter(
      (m) => toMemoryCategory(m.category) === category
    );
    if (!inCategory.length) continue;
    lines.push("", `### ${MEMORY_CATEGORIES[category].label}`);
    for (const m of inCategory) {
      const title = m.title.trim();
      lines.push("", title ? `**${title}**` : "**Note**", m.content.trim());
    }
  }

  const text = lines.join("\n");
  return text.length > MEMORY_CONTEXT_LIMIT
    ? `${text.slice(0, MEMORY_CONTEXT_LIMIT)}\n\n[memory truncated]`
    : text;
}

interface MemoryState {
  memories: Memory[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Load once — used by the AI store before assembling a prompt. */
  ensureLoaded: () => Promise<void>;
  /** Create an empty (or prefilled) memory and return it for focusing. */
  add: (seed?: Partial<Memory>) => Promise<Memory>;
  update: (
    id: string,
    patch: Partial<Pick<Memory, "title" | "content" | "category" | "enabled">>
  ) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useMemory = create<MemoryState>((set, get) => ({
  memories: [],
  loaded: false,

  async load() {
    const memories = await memoriesRepo.list();
    set({ memories, loaded: true });
  },

  async ensureLoaded() {
    if (!get().loaded) await get().load();
  },

  async add(seed) {
    const ts = now();
    const memory: Memory = {
      id: nanoid(),
      title: seed?.title ?? "",
      content: seed?.content ?? "",
      category: seed?.category ?? "general",
      enabled: 1,
      created_at: ts,
      updated_at: ts,
    };
    set((s) => ({ memories: [memory, ...s.memories] }));
    await memoriesRepo.create(memory);
    return memory;
  },

  async update(id, patch) {
    set((s) => ({
      memories: s.memories.map((m) =>
        m.id === id ? { ...m, ...patch, updated_at: now() } : m
      ),
    }));
    await memoriesRepo.update(id, patch);
  },

  async toggle(id) {
    const memory = get().memories.find((m) => m.id === id);
    if (!memory) return;
    await get().update(id, { enabled: memory.enabled ? 0 : 1 });
  },

  async remove(id) {
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
    await memoriesRepo.remove(id);
  },
}));
