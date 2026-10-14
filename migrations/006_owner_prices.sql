-- Confirmed by a prior owner-supplied price note (กาแฟโตนด 40 บาท),
-- while the older public cafe menu still has 45; keep unverified until owner review.
UPDATE catalog SET price=40,updated_at=CURRENT_TIMESTAMP WHERE id='7' AND price=45;
UPDATE catalog_price_reviews
SET verified=0,reviewed_at=NULL,source='owner-prior-note-40-pending-review'
WHERE product_id='7';
-- ขนมปังเนยนม remains 15 per piece; bundle of 2 for 25 is enforced
-- consistently in the checkout API and cart code, not by changing base price.
