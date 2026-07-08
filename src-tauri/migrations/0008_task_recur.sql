-- Recurrence preset for a task: 'daily' | 'weekdays' | 'weekly' | 'monthly'
-- | 'yearly'. NULL means the task does not repeat. Only meaningful while the
-- task has a due date; cleared when the due date is removed.
ALTER TABLE tasks ADD COLUMN recur TEXT;
