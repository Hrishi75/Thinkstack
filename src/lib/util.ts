export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): ((...args: A) => void) & { flush: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const wrapped = (...args: A) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      if (lastArgs) fn(...lastArgs);
    }, ms);
  };
  wrapped.flush = () => {
    if (t) {
      clearTimeout(t);
      t = null;
      if (lastArgs) fn(...lastArgs);
    }
  };
  return wrapped;
}

/** Extract plain text from a BlockNote document (array of blocks) for FTS. */
export function blocksToText(doc: unknown): string {
  const out: string[] = [];
  const walkInline = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (item && typeof item === "object" && "text" in item) {
        out.push(String((item as { text: unknown }).text ?? ""));
      }
    }
  };
  const walk = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (block && typeof block === "object") {
        const b = block as { content?: unknown; children?: unknown };
        walkInline(b.content);
        if (b.children) walk(b.children);
      }
    }
  };
  walk(doc);
  return out.join(" ").trim();
}

/** Compact "how long ago" label, e.g. "3m ago", "2h ago", "5d ago". */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** First non-empty line of plain text → note title. */
export function deriveTitle(text: string): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean);
  return (firstLine ?? "").slice(0, 120) || "Untitled";
}
