-- Store point use attached to an order. Points are charged at order placement and restored once if the order is cancelled.
ALTER TABLE orders ADD COLUMN points_used INTEGER NOT NULL DEFAULT 0 CHECK(points_used >= 0);
