-- All 90 WebP menu photos copied from owner-supplied ZIP (1-54)
-- and from the owner's old public ordering site (55-90).
-- Run only after verifying assets/products/01.webp through 90.webp exist
-- in the deployed GitHub branch. Idempotent.
UPDATE catalog
SET image='/assets/products/' || substr('00' || id,-2) || '.webp',
    updated_at=CURRENT_TIMESTAMP
WHERE CAST(id AS INTEGER) BETWEEN 1 AND 90 AND id GLOB '[0-9]*';
