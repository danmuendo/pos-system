-- Add discount_amount to transactions to track discounts applied at checkout
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- Add per-product reorder point (NULL means use the global default threshold of 10)
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT NULL;
