-- Allow the primary owner to grant admin access to LINE members.
-- Added admins can manage orders and receive new order notifications.
CREATE TABLE IF NOT EXISTS shop_admins (
  line_user_id TEXT PRIMARY KEY REFERENCES members(line_user_id),
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_admins_created ON shop_admins(created_at);
