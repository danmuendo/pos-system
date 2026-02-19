-- Add optional product cost price for profitability reports
-- Apply on existing databases:
-- psql -U postgres -d pos_db -f backend/database/add_product_cost_price.sql

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);
