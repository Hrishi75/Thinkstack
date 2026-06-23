import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

/** Lazily open the single shared SQLite connection (migrations run in Rust). */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:thinkstack.db");
  }
  return dbPromise;
}

export const now = () => Date.now();
