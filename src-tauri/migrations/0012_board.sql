-- Placement of an item on the unified board. Cards come from four different
-- tables (tasks, notes, sticky_notes, workers), so the board keeps its own
-- row per item instead of adding a stage column to each of them. An item
-- with no row here isn't missing from the board — it falls back to a stage
-- derived from its own state, and only gets a row once the user drags it.
CREATE TABLE IF NOT EXISTS board_items (
  -- 'task' | 'note' | 'sticky' | 'worker'
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  -- 'backlog' | 'todo' | 'doing' | 'done'
  stage TEXT NOT NULL,
  -- Order within the column, ascending.
  position REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_board_items_stage ON board_items(stage);
