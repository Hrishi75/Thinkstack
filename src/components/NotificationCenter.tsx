import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Bell,
  Boxes,
  CalendarClock,
  CircleCheck,
  Clock,
  FileText,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useNotifications, useUnreadCount } from "../store/notifications";
import { useUI } from "../store/ui";
import { useNotes } from "../store/notes";
import {
  NOTIFICATION_TONES,
  toNotificationKind,
  type AppNotification,
  type NotificationKind,
} from "../lib/types";
import ConfirmButton from "./ConfirmButton";
import { cn, relativeTime } from "../lib/util";

const KIND_ICONS: Record<NotificationKind, typeof Bell> = {
  task_due: Clock,
  task_scheduled: CalendarClock,
  note: FileText,
  ai: Sparkles,
  worker_review: Boxes,
  worker_done: CircleCheck,
  worker_failed: AlertTriangle,
  system: Settings2,
  error: AlertTriangle,
};

function Row({
  item,
  onOpen,
  onDismiss,
}: {
  item: AppNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  // Rows come from the database, so a kind written by an older build is
  // coerced rather than trusted to index the maps.
  const kind = toNotificationKind(item.kind);
  const Icon = KIND_ICONS[kind];
  const linked = item.link_kind !== "";

  return (
    <div
      onClick={linked ? onOpen : undefined}
      className={cn(
        "group flex gap-2.5 px-3 py-2.5 transition",
        linked && "cursor-pointer hover:bg-elevated/60",
        !item.read && "bg-accent/[0.05]"
      )}
    >
      <Icon size={14} className={cn("mt-0.5 shrink-0", NOTIFICATION_TONES[kind])} />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[12.5px] leading-snug",
            !item.read && "font-medium"
          )}
        >
          {item.title}
        </div>
        {item.body && (
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
            {item.body}
          </div>
        )}
        <div className="mt-1 text-[10.5px] text-muted/70">
          {relativeTime(item.created_at)}
        </div>
      </div>

      {/* The unread dot gives way to the dismiss button on hover. */}
      <div className="flex shrink-0 items-start">
        {!item.read && (
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent group-hover:hidden" />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          title="Dismiss"
          className="hidden rounded p-0.5 text-muted transition hover:bg-elevated hover:text-text group-hover:block"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * Bell + unread badge with the in-app feed behind it. Entries outlive the
 * desktop banners they accompany, so a reminder that fired while the user was
 * elsewhere is still there when they come back. `align` sets which edge the
 * panel grows from, so it stays on-screen wherever the bell is mounted.
 */
export default function NotificationCenter({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  const items = useNotifications((s) => s.items);
  const unread = useUnreadCount();
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const remove = useNotifications((s) => s.remove);
  const clear = useNotifications((s) => s.clear);

  const setView = useUI((s) => s.setView);
  const selectNote = useNotes((s) => s.select);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (item: AppNotification) => {
    markRead(item.id);
    setOpen(false);
    switch (item.link_kind) {
      case "task":
        setView("tasks");
        break;
      case "note":
        selectNote(item.link_id);
        setView("notes");
        break;
      case "sticky":
        invoke("open_sticky", { id: item.link_id });
        break;
      case "worker":
        setView("orchestration");
        break;
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={unread ? `${unread} unread` : "Notifications"}
        className={cn(
          "relative rounded-md p-1.5 transition",
          open
            ? "bg-elevated text-text"
            : "text-muted hover:bg-elevated/60 hover:text-text"
        )}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent px-1 text-[9.5px] font-medium tabular-nums leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.13, ease: "easeOut" }}
            className={cn(
              "absolute top-full z-40 mt-2 w-[320px] overflow-hidden rounded-xl border border-border bg-surface shadow-pop",
              align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"
            )}
          >
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <span className="flex-1 text-[12.5px] font-medium">
                Notifications
              </span>
              {unread > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="rounded px-1.5 py-0.5 text-[11px] text-muted transition hover:bg-elevated hover:text-text"
                >
                  Mark all read
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-3 py-8 text-center">
                <Bell size={20} className="text-muted/40" />
                <p className="text-[12px] text-muted">You're all caught up.</p>
                <p className="text-[11px] text-muted/70">
                  Due tasks and worker updates land here.
                </p>
              </div>
            ) : (
              <>
                <div className="max-h-[340px] divide-y divide-border/60 overflow-y-auto">
                  {items.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      onOpen={() => openItem(item)}
                      onDismiss={() => remove(item.id)}
                    />
                  ))}
                </div>
                {/* Clearing is unrecoverable, so it takes two clicks. */}
                <div className="border-t border-border/70 px-2 py-1">
                  <ConfirmButton
                    label="Clear all"
                    confirmLabel={`Delete ${items.length} forever?`}
                    onConfirm={() => clear()}
                    className="text-[11px]"
                  />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
