-- Worker dependencies: a worker may wait for another to be approved before it
-- starts, so a follow-up task builds on finished work instead of racing it.
--
-- Empty means "nothing to wait for" — the default, and how every existing row
-- is read. A dependent worker sits in the new 'queued' status with no worktree
-- and no process; both are created only when its parent is approved.
ALTER TABLE workers ADD COLUMN depends_on TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_workers_depends_on ON workers(depends_on);
