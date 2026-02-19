-- Add barcode support for fast scanner checkout
-- Apply on existing databases:
-- psql -U postgres -d pos_db -f backend/database/add_product_barcode.sql

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);

-- Normalize empty strings to NULL before creating unique index.
UPDATE products
SET barcode = NULL
WHERE barcode IS NOT NULL AND TRIM(barcode) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_barcode_unique
ON products(user_id, barcode)
WHERE barcode IS NOT NULL;
