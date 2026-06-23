import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { X, Palette } from "lucide-react";
import { stickyRepo } from "../lib/repo";
import { STICKY_COLORS } from "../lib/types";
import type { Sticky } from "../lib/types";
import { debounce } from "../lib/util";

export default function StickyWindow({ id }: { id: string }) {
  const [sticky, setSticky] = useState<Sticky | null>(null);
  const [content, setContent] = useState("");
  const [color, setColor] = useState("yellow");
  const [showColors, setShowColors] = useState(false);

  const saveContent = useRef(
    debounce((value: string) => stickyRepo.update(id, { content: value }), 400)
  ).current;

  const saveGeometry = useRef(
    debounce((g: Partial<Sticky>) => stickyRepo.update(id, g), 300)
  ).current;

  // Load sticky, restore geometry, and wire move/resize persistence.
  useEffect(() => {
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    (async () => {
      const s = await stickyRepo.get(id);
      if (!s) return;
      setSticky(s);
      setContent(s.content);
      setColor(s.color);

      const win = getCurrentWindow();
      if (s.x != null && s.y != null) {
        await win.setPosition(new PhysicalPosition(s.x, s.y));
      }
      if (s.width && s.height) {
        await win.setSize(new PhysicalSize(s.width, s.height));
      }
      unlistenMoved = await win.onMoved(({ payload }) =>
        saveGeometry({ x: payload.x, y: payload.y })
      );
      unlistenResized = await win.onResized(({ payload }) =>
        saveGeometry({ width: payload.width, height: payload.height })
      );
    })();
    return () => {
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [id, saveGeometry]);

  if (!sticky) return null;

  const c = STICKY_COLORS[color] ?? STICKY_COLORS.yellow;

  const pickColor = (key: string) => {
    setColor(key);
    setShowColors(false);
    stickyRepo.update(id, { color: key });
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden rounded-xl shadow-pop"
      style={{ background: c.bg, color: c.text }}
    >
      {/* draggable handle */}
      <div className="drag-region flex h-8 shrink-0 items-center justify-end gap-1 px-2">
        <button
          onClick={() => setShowColors((v) => !v)}
          className="no-drag rounded p-1 opacity-50 transition hover:bg-black/10 hover:opacity-100"
          title="Color"
        >
          <Palette size={14} />
        </button>
        <button
          onClick={() => getCurrentWindow().close()}
          className="no-drag rounded p-1 opacity-50 transition hover:bg-black/10 hover:opacity-100"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {showColors && (
        <div className="no-drag flex flex-wrap gap-1.5 px-3 pb-1">
          {Object.entries(STICKY_COLORS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => pickColor(key)}
              style={{ background: val.bg }}
              className="h-5 w-5 rounded-full ring-1 ring-black/10 transition hover:scale-110"
            />
          ))}
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          saveContent(e.target.value);
        }}
        autoFocus
        placeholder="Write something…"
        className="no-drag flex-1 resize-none bg-transparent px-3 pb-3 text-sm leading-relaxed outline-none placeholder:opacity-40"
      />
    </div>
  );
}
