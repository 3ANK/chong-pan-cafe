-- Preserve notification outcome for each recorded order.
-- Reapplicable. Never contains customer identifiers or any LINE access token.
CREATE TABLE IF NOT EXISTS order_notifications (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  delivered INTEGER NOT NULL CHECK(delivered IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
