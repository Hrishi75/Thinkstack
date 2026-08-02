import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Trash2, Clock, Copy } from "lucide-react";
import { useNotes } from "../../store/notes";
import { useUI } from "../../store/ui";
import { announce } from "../../store/notifications";
import { blocksToText, countWords, debounce, relativeTime } from "../../lib/util";
import { dateTimeLabel } from "../../lib/dates";
import type { Note } from "../../lib/types";
import TagBar from "./TagBar";
import AiPanel from "./AiPanel";

const EMOJIS = [
  "📄", "📝", "📌", "💡", "✅", "🔥", "⭐️", "📚", "🧠", "🎯",
  "🚀", "🗒️", "📊", "🧩", "❤️", "🌱", "☕️", "🎨", "🔧", "📅",
];

function parseContent(json: string): PartialBlock[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Editor for a single note. Parent must key this by note.id so it remounts on switch. */
export default function NoteEditor({ note }: { note: Note }) {
  const theme = useUI((s) => s.theme);
  const showToast = useUI((s) => s.showToast);
  const saveContent = useNotes((s) => s.saveContent);
  const archive = useNotes((s) => s.archive);
  const restore = useNotes((s) => s.restore);

  const moveToTrash = async () => {
    await archive(note.id);
    // Deliberately unlinked: the note is out of the notes list now, so a
    // click would open an empty editor. Undo lives on the toast instead.
    void announce({
      kind: "note",
      title: "Note moved to trash",
      body: note.title,
      toast: { label: "Undo", run: () => void restore(note.id) },
    });
  };

  const [title, setTitle] = useState(note.title === "Untitled" ? "" : note.title);
  const [icon, setIcon] = useState(note.icon);
  const [pickerOpen, setPickerOpen] = useState(false);

  const initialContent = useMemo(() => parseContent(note.content_json), [note.id]);
  const editor = useCreateBlockNote({ initialContent });

  const [words, setWords] = useState(() => countWords(note.body_text));

  const copyMarkdown = async () => {
    try {
      const md = await editor.blocksToMarkdownLossy(editor.document);
      await navigator.clipboard.writeText(md);
      showToast("Copied note as Markdown");
    } catch {
      showToast("Couldn't copy — clipboard unavailable");
    }
  };

  const saveBody = useRef(
    debounce((id: string) => {
      const doc = editor.document;
      saveContent(id, {
        content_json: JSON.stringify(doc),
        body_text: blocksToText(doc),
      });
    }, 400)
  ).current;

  const saveTitle = useRef(
    debounce((id: string, value: string) => {
      saveContent(id, { title: value.trim() || "Untitled" });
    }, 300)
  ).current;

  // Flush any pending debounced save when this editor unmounts (e.g. on note
  // switch — the editor is keyed by note.id and remounts). Otherwise the last
  // <400ms of edits are silently dropped.
  useEffect(() => {
    return () => {
      saveTitle.flush();
      saveBody.flush();
    };
  }, [saveTitle, saveBody]);

  const pickIcon = (e: string) => {
    setIcon(e);
    setPickerOpen(false);
    saveContent(note.id, { icon: e });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-10 items-center justify-end gap-1 px-4">
        <AiPanel note={note} editor={editor} />
        <button
          onClick={copyMarkdown}
          className="no-drag rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-text"
          title="Copy as Markdown"
        >
          <Copy size={16} />
        </button>
        <button
          onClick={moveToTrash}
          className="no-drag rounded-md p-1.5 text-muted transition hover:bg-elevated hover:text-red-500"
          title="Move to trash"
        >
          <Trash2 size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-12 pb-24">
        <div className="mx-auto max-w-[720px]">
          {/* Emoji */}
          <div className="relative pt-4">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-lg px-1 text-[44px] leading-none transition hover:bg-elevated"
            >
              {icon}
            </button>
            {pickerOpen && (
              <div className="absolute z-10 mt-1 grid w-[280px] grid-cols-10 gap-0.5 rounded-xl border border-border bg-surface p-2 shadow-pop">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => pickIcon(e)}
                    className="rounded-md p-1 text-lg transition hover:bg-elevated"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              saveTitle(note.id, e.target.value);
            }}
            placeholder="Untitled"
            className="mt-2 w-full bg-transparent text-[32px] font-semibold leading-tight tracking-tight outline-none placeholder:text-muted/50"
          />

          {/* Created / edited stamps */}
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted/80">
            <Clock size={11} className="shrink-0" />
            <span>Created {dateTimeLabel(note.created_at)}</span>
            <span className="text-muted/50">·</span>
            <span>Edited {relativeTime(note.updated_at)}</span>
            <span className="text-muted/50">·</span>
            <span>{words === 1 ? "1 word" : `${words} words`}</span>
          </div>

          {/* Tags */}
          <TagBar noteId={note.id} />

          {/* Body */}
          <div className="mt-2">
            <BlockNoteView
              editor={editor}
              theme={theme}
              onChange={() => {
                saveBody(note.id);
                setWords(countWords(blocksToText(editor.document)));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
