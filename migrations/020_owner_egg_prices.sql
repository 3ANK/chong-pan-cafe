UPDATE catalog
SET price = 15, updated_at = CURRENT_TIMESTAMP
WHERE id = '60' AND name = 'ไข่ดาว' AND category = 'ข้าวและไข่สั่งแยก';

INSERT INTO catalog (id, name, category, price, image, emoji, drink, available, sort_order)
VALUES ('century-egg', 'ไข่เยี่ยวม้า', 'ข้าวและไข่สั่งแยก', 20, '', '🥚', 0, 1, 239)
ON CONFLICT(id) DO NOTHING;

INSERT INTO catalog_price_reviews (product_id, source, verified)
SELECT id, 'owner-menu-20261114', 1 FROM catalog
WHERE (id = '60' AND name = 'ไข่ดาว' AND price = 15 AND category = 'ข้าวและไข่สั่งแยก')
   OR (id = 'century-egg' AND name = 'ไข่เยี่ยวม้า' AND price = 20 AND category = 'ข้าวและไข่สั่งแยก')
ON CONFLICT(product_id) DO UPDATE SET source = excluded.source, verified = 1;
