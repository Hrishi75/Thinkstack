import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  AppNotification,
  BoardKind,
  NotificationKind,
} from "../lib/types";
import { NOTIFICATION_CAP, notificationsRepo } from "../lib/repo";
import { notify } from "../lib/notifications";
import { now } from "../lib/db";
import { useUI } from "./ui";

/** One transient action offered alongside a toast (Undo, Open, View…). */
interface ToastAction {
  label: string;
  run: () => void;
}

export interface Announcement {
  kind: NotificationKind;
  title: string;
  body?: string;
  /**
   * Stable id of the event, for anything that observes the same state
   * repeatedly — the due-task sweep runs every minute and pushes every time.
   * The second push for a key is dropped. Omit for one-off user actions,
   * which are distinct events every time they happen.
   */
  eventKey?: string;
  /** Item the entry opens; omit when there's nothing to go to. */
  link?: { kind: BoardKind; id: string };
  /** Also show a transient toast, optionally with one inline action. */
  toast?: boolean | ToastAction;
  /** Also raise a desktop banner — for events the user isn't watching for. */
  desktop?: boolean;
}

interface NotificationsState {
  items: AppNotification[];
  loaded: boolean;
  load: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  loaded: false,

  async load() {
    try {
      await notificationsRepo.prune();
      set({ items: await notificationsRepo.list(), loaded: true });
    } catch (e) {
      // An unreadable feed must not stop the app from starting; the rest of
      // the workspace has nothing to do with it.
      console.error("notifications: load failed", e);
      set({ loaded: true });
    }
  },

  async markRead(id) {
    const before = get().items;
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, read: 1 } : n)),
    }));
    await write(() => notificationsRepo.markRead(id), before, set);
  },

  async markAllRead() {
    const before = get().items;
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: 1 })) }));
    await write(() => notificationsRepo.markAllRead(), before, set);
  },

  async remove(id) {
    const before = get().items;
    set((s) => ({ items: s.items.filter((n) => n.id !== id) }));
    await write(() => notificationsRepo.remove(id), before, set);
  },

  async clear() {
    const before = get().items;
    set({ items: [] });
    await write(() => notificationsRepo.clear(), before, set);
  },
}));

type SetState = (partial: Partial<NotificationsState>) => void;

/**
 * Run an optimistic write, putting the list back if the database refuses it.
 * Every mutation here paints first and stores second; without the rollback a
 * failed write would leave the badge disagreeing with the table until the
 * next launch, which is the one thing a read/unread list can't afford.
 */
async function write(
  fn: () => Promise<void>,
  before: AppNotification[],
  set: SetState
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error("notifications: write failed", e);
    set({ items: before });
  }
}

/**
 * The single way the app tells the user something happened.
 *
 * Every call records a feed entry — that is the point of routing through
 * here: the notification center is the complete log, so nothing can be missed
 * by looking away at the wrong moment. `toast` and `desktop` are extra
 * channels layered on top, never instead of the entry.
 *
 * Immediate feedback on an action that changed no state ("Copied to
 * clipboard") is not an event and should keep using `showToast` directly —
 * a permanent record of it would only bury the things that matter.
 *
 * Never throws: a notification failing is not worth breaking a caller that
 * has already done its real work.
 */
export async function announce(a: Announcement): Promise<void> {
  if (a.toast) {
    const action = typeof a.toast === "object" ? a.toast : undefined;
    useUI
      .getState()
      .showToast(a.title, action && { label: action.label, run: action.run });
  }
  if (a.desktop) void notify(a.title, a.body);

  const row: AppNotification = {
    id: nanoid(),
    kind: a.kind,
    // A one-off action is a new event each time it happens, so it gets a key
    // nothing else can collide with.
    event_key: a.eventKey ?? `evt:${nanoid()}`,
    title: a.title,
    body: a.body ?? "",
    link_kind: a.link?.kind ?? "",
    link_id: a.link?.id ?? "",
    read: 0,
    created_at: now(),
  };

  try {
    // The insert decides whether this event is new, so two callers racing on
    // the same key can't both land. It also returns the row as stored —
    // clamped and validated — so the list shows exactly what's on disk.
    const stored = await notificationsRepo.add(row);
    if (!stored) return;

    const items = [stored, ...useNotifications.getState().items];
    useNotifications.setState({ items: items.slice(0, NOTIFICATION_CAP) });

    // Trim on the write that overflows, not only on load: a long session with
    // a busy orchestrator would otherwise grow the table until next launch.
    if (items.length > NOTIFICATION_CAP) await notificationsRepo.prune();
  } catch (e) {
    console.error("notifications: announce failed", e);
  }
}

/** Unread count, for the badge. */
export function useUnreadCount(): number {
  return useNotifications((s) =>
    s.items.reduce((n, item) => n + (item.read ? 0 : 1), 0)
  );
}
