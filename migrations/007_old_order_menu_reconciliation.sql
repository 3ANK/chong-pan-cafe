-- Prices and labels visible on original owner-provided /order page, 2026-10-14.
-- Source = original ordering page, NOT current Loyverse; price flags stay unverified.
-- Retain the owner's separately supplied 40 THB instruction for กาแฟโตนด (ID 7),
-- which conflicts with the older order page's displayed 45 THB.
UPDATE catalog SET
 name=CASE id
 WHEN '9' THEN 'ชาเขียวเย็น'
 WHEN '12' THEN 'นมชมพูเย็น'
 WHEN '28' THEN 'มะพร้าวนมสดปั่น'
 WHEN '29' THEN 'อะโวคาโดนมสดปั่น'
 WHEN '64' THEN 'โกโก้เย็น'
 WHEN '65' THEN 'โอวัลตินเย็น'
 WHEN '66' THEN 'ไมโลเย็น'
 WHEN '71' THEN 'สตรอว์เบอร์รีนมสดปั่น'
 ELSE name END,
 price=CASE id
 WHEN '64' THEN 40
 WHEN '69' THEN 50
 WHEN '84' THEN 40
 WHEN '85' THEN 30 WHEN '86' THEN 30 WHEN '87' THEN 30
 WHEN '88' THEN 30 WHEN '89' THEN 30 WHEN '90' THEN 30
 ELSE price END,
 available=CASE WHEN id IN ('84','85','86','87','88','89','90') THEN 1 ELSE available END,
 updated_at=CURRENT_TIMESTAMP
 WHERE id IN ('9','12','28','29','64','65','66','69','71','84','85','86','87','88','89','90');
UPDATE catalog_price_reviews
 SET source='old-order-page-2026-10-14-not-loyverse',verified=0,reviewed_at=NULL
 WHERE product_id IN ('64','69','84','85','86','87','88','89','90');
-- The 7 recovered products now have reference prices; shop checkout stays OFF.
