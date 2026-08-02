-- In-app notification feed. Desktop notifications are fire-and-forget: if the
-- user misses the banner it is gone, and nothing that happened while a worker
-- ran is recoverable. These rows persist instead, so the unread badge and the
-- list survive a restart and each entry stays dismissable on its own.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  -- 'task_due' | 'worker_review' | 'worker_failed'
  kind TEXT NOT NULL,
  -- Stable id of the underlying event. UNIQUE so a periodic check that keeps
  -- finding the same state can't record it twice.
  event_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  -- Item to open on click: 'task' | 'note' | 'sticky' | 'worker'; '' for none.
  link_kind TEXT NOT NULL DEFAULT '',
  link_id TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
