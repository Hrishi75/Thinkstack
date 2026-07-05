-- Track whether a due-task notification has been delivered, so each task
-- notifies at most once. Reset to 0 whenever the due date changes.
ALTER TABLE tasks ADD COLUMN notified INTEGER NOT NULL DEFAULT 0;
