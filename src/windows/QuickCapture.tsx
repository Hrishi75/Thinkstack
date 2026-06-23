import { useState } from "react";
import { nanoid } from "nanoid";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { FileText, CheckSquare } from "lucide-react";
import { notesRepo, tasksRepo } from "../lib/repo";
import { now } from "../lib/db";
import { deriveTitle } from "../lib/util";
import { cn } from "../lib/util";

type Mode = "note" | "task";

export default function QuickCapture() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("note");

  const close = () => getCurrentWindow().hide();

  const save = async () => {
    const value = text.trim();
    if (!value) return close();
    if (mode === "task") {
      await tasksRepo.create({
        id: nanoid(),
        title: value,
        done: 0,
        due_at: null,
        priority: 0,
        note_id: null,
        position: -now(),
        created_at: now(),
      });
    } else {
      const block = [
        { type: "paragraph", content: [{ type: "text", text: value, styles: {} }] },
      ];
      const ts = now();
      await notesRepo.create({
        id: nanoid(),
        title: deriveTitle(value),
        content_json: JSON.stringify(block),
        body_text: value,
        icon: "📝",
        archived: 0,
        pinned: 0,
        created_at: ts,
        updated_at: ts,
      });
    }
    await emit("thinkstack://refresh");
    setText("");
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setMode((m) => (m === "note" ? "task" : "note"));
    }
  };

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-pop backdrop-blur">
        <div className="drag-region flex items-center gap-2 px-4 pt-3 text-xs text-muted">
          <span>Quick capture</span>
          <span className="ml-auto">⏎ save · ⇥ switch · esc close</span>
        </div>
        <div className="flex items-center gap-2 px-3 pb-2 pt-1">
          {(["note", "task"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-xs capitalize transition",
                mode === m
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-elevated"
              )}
            >
              {m === "note" ? <FileText size={13} /> : <CheckSquare size={13} />}
              {m}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={mode === "note" ? "Capture a thought…" : "Add a task…"}
          className="no-drag h-16 w-full resize-none bg-transparent px-4 pb-3 text-[15px] outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}
