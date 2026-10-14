-- Migration metadata only. Never commit customer names, LINE IDs or screenshot contents.
-- Run only on D1 database chongpan-orders-v2, not the dormitory database.
CREATE TABLE IF NOT EXISTS legacy_accounts (
  legacy_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  snapshot_points INTEGER NOT NULL CHECK(snapshot_points >= 0),
  source TEXT NOT NULL DEFAULT 'owner-supplied-screenshot',
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_line_user_id TEXT UNIQUE REFERENCES members(line_user_id),
  claimed_at TEXT,
  claimed_by TEXT,
  CHECK(length(legacy_code) = 8)
);
CREATE INDEX IF NOT EXISTS idx_legacy_claimed ON legacy_accounts(claimed_line_user_id);
CREATE TABLE IF NOT EXISTS points_adjustments (
  source_key TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL REFERENCES members(line_user_id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_adjustments_member ON points_adjustments(line_user_id);