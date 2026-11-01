CREATE TABLE IF NOT EXISTS chat_safety_incidents (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high','critical')),
  reason TEXT NOT NULL,
  message_excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed'))
);
CREATE INDEX IF NOT EXISTS idx_chat_safety_incidents_created ON chat_safety_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_safety_incidents_visitor ON chat_safety_incidents(visitor_id);

CREATE TABLE IF NOT EXISTS chat_safety_blocks (
  visitor_id TEXT PRIMARY KEY,
  blocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  blocked_by TEXT NOT NULL DEFAULT 'automatic_safety_rule',
  reason TEXT NOT NULL,
  unblocked_at TEXT,
  unblocked_by TEXT
);

CREATE TABLE IF NOT EXISTS chat_safety_block_history (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('blocked','unblocked')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_safety_history_visitor ON chat_safety_block_history(visitor_id, created_at DESC);
