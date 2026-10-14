-- New dedicated database. Never apply these migrations to phaksakul-tenant-services.
CREATE TABLE IF NOT EXISTS catalog (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
 image TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL DEFAULT '🥤', drink INTEGER NOT NULL DEFAULT 0,
 available INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS members (
 line_user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL, line_user_id TEXT NOT NULL REFERENCES members(line_user_id),
 display_name TEXT NOT NULL, fulfillment TEXT NOT NULL CHECK(fulfillment IN ('pickup','delivery')),
 delivery_address TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL CHECK(total >= 0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','preparing','ready','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT,
 UNIQUE(line_user_id,request_key)
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(line_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), catalog_id TEXT NOT NULL,
 name TEXT NOT NULL, unit_price INTEGER NOT NULL, egg_price INTEGER NOT NULL DEFAULT 0,
 qty INTEGER NOT NULL CHECK(qty>0), sweetness TEXT NOT NULL DEFAULT '', egg TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS points_ledger (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 line_user_id TEXT NOT NULL REFERENCES members(line_user_id), delta INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shop_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO shop_settings(key,value) VALUES('shop_enabled','0');