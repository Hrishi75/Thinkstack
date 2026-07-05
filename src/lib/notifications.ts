import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/** Due-task reminders fire at this local hour on the due day. */
export const REMINDER_HOUR = 9;

/** The moment a reminder should fire for a due date (stored as local midnight). */
export function reminderAt(dueAt: number): number {
  return dueAt + REMINDER_HOUR * 3_600_000;
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
