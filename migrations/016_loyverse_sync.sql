-- Order sync bookkeeping only; credentials are encrypted separately in shop_settings.
CREATE TABLE IF NOT EXISTS loyverse_sync (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 status TEXT NOT NULL DEFAULT 'pending',
 receipt_number TEXT NOT NULL DEFAULT '',
 message TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
