-- Catalog completion from previously identified missing items. Prices are UNKNOWN;
-- draft entries stay unavailable until the owner sets and verifies a real price.
-- Requires 001, 002, 003, 004. Idempotent and does not touch orders or points.
INSERT OR IGNORE INTO catalog(id,name,category,price,image,emoji,drink,available,sort_order) VALUES
('84','นมสดบลูเบอร์รี่ปั่น','น้ำปั่น',0,'','🥤',1,0,84),
('85','บลูเบอร์รี่โซดา','โซดา',0,'','🥤',1,0,85),
('86','ลิ้นจี่โซดา','โซดา',0,'','🥤',1,0,86),
('87','แอปเปิ้ลเขียวโซดา','โซดา',0,'','🥤',1,0,87),
('88','แดงบ๊วยโซดา','โซดา',0,'','🥤',1,0,88),
('89','สตรอว์เบอร์รีโซดา','โซดา',0,'','🥤',1,0,89),
('90','ส้มโซดา','โซดา',0,'','🥤',1,0,90);
-- Track verification for every item, not only the first 54 photographs.
INSERT OR IGNORE INTO catalog_price_reviews(product_id,source,verified)
SELECT id,'recovered-catalog-unconfirmed',0 FROM catalog;
