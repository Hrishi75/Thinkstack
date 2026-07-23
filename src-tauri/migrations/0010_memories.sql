-- Long-lived context the user never wants to retype: what the company does,
-- who the team is, how they want things written. Every enabled memory is
-- prepended to the AI system prompt, so `enabled` turns one off without
-- losing it.
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_enabled ON memories(enabled);
