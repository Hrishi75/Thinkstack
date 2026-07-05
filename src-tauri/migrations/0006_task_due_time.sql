-- Optional time-of-day for task due dates. When set, due_at holds the exact
-- due moment and reminders fire then; all-day tasks keep local midnight and
-- remind at the default morning hour.
ALTER TABLE tasks ADD COLUMN due_has_time INTEGER NOT NULL DEFAULT 0;
