import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/** All-day due tasks remind at this local hour on the due day. */
export const REMINDER_HOUR = 9;

/**
 * The moment a reminder should fire. Tasks with a due time remind exactly
 * then; all-day tasks (due_at = local midnight) remind at REMINDER_HOUR.
 */
export function reminderAt(dueAt: number, hasTime = 0): number {
  if (hasTime) return dueAt;
  // Set the wall-clock hour instead of adding a fixed offset, so a DST
  // change between midnight and the reminder hour doesn't shift it.
  const d = new Date(dueAt);
  d.setHours(REMINDER_HOUR, 0, 0, 0);
  return d.getTime();
}

let granted: boolean | null = null;

async function canNotify(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

/** Send a desktop notification if the user allows them; never throws. */
export async function notify(title: string, body?: string): Promise<void> {
  try {
    if (await canNotify()) sendNotification({ title, body });
  } catch {
    // notifications are best-effort
  }
}
