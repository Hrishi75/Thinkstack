-- Availability marks the user puts on calendar days: 'busy' | 'tentative'
-- | 'away', plus an optional short note. One mark per local day; unmarked
-- days are implicitly free.
CREATE TABLE IF NOT EXISTS day_marks (
  day TEXT PRIMARY KEY,        -- local yyyy-mm-dd
  kind TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
