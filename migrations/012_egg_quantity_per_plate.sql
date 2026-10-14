-- Preserve existing orders while supporting multiple eggs per plate.
-- Legacy orders already encoded a single egg as a non-empty egg type.
ALTER TABLE order_items ADD COLUMN egg_qty INTEGER NOT NULL DEFAULT 0 CHECK(egg_qty BETWEEN 0 AND 5);
UPDATE order_items SET egg_qty=1 WHERE egg<>'' AND egg_price>0;
