-- Migration: Add unit of measure to products and convert quantities to DECIMAL
-- This supports selling products by weight (kg), volume (litre), or count (item)

-- 1. Add unit column to products (default 'item' for existing products)
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT 'item';

-- 2. Convert stock_quantity from INTEGER to DECIMAL(10,3)
ALTER TABLE products ALTER COLUMN stock_quantity TYPE DECIMAL(10, 3) USING stock_quantity::DECIMAL(10, 3);
ALTER TABLE products ALTER COLUMN stock_quantity SET DEFAULT 0;

-- 3. Convert transaction_items quantity from INTEGER to DECIMAL(10,3)
ALTER TABLE transaction_items ALTER COLUMN quantity TYPE DECIMAL(10, 3) USING quantity::DECIMAL(10, 3);

-- 4. Add unit column to transaction_items so receipts show the unit at time of sale
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT 'item';
