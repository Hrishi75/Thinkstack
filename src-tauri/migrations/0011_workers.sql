-- Orchestration workers: each row is one Claude Code session running in its
-- own git worktree against a GitHub issue or PR. The OS process itself lives
-- only in memory, so a worker still marked 'running' at startup is an orphan
-- from a previous launch and gets reconciled to 'stopped'.
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  repo_label TEXT NOT NULL DEFAULT '',
  -- 'issue' | 'pr'
  source_kind TEXT NOT NULL DEFAULT 'issue',
  source_number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL,
  worktree_path TEXT NOT NULL DEFAULT '',
  -- Commit the worktree branched from; diffs are computed against it.
  base_sha TEXT NOT NULL DEFAULT '',
  -- 'running' | 'review' | 'approved' | 'failed' | 'stopped'
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  cost_usd REAL NOT NULL DEFAULT 0,
  pr_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
