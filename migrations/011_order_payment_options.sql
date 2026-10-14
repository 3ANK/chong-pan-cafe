-- Additive payment bookkeeping. Existing orders remain legacy / unpaid.
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'legacy' CHECK(payment_method IN ('legacy','cash','qr'));
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','verified'));
INSERT OR IGNORE INTO shop_settings(key,value) VALUES('payment_qr_path','');
INSERT OR IGNORE INTO shop_settings(key,value) VALUES('line_oa_basic_id','');
