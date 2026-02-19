-- Security and integrity migration
-- Apply on existing databases:
-- psql -U postgres -d pos_db -f backend/database/security_integrity_migration.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'cashier',
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS business_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS business_tax_pin VARCHAR(100),
  ADD COLUMN IF NOT EXISTS business_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT;

UPDATE users
SET role = 'owner'
WHERE role IS NULL OR role = 'cashier';

UPDATE users
SET owner_user_id = id
WHERE owner_user_id IS NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'mpesa',
  ADD COLUMN IF NOT EXISTS parent_transaction_id INTEGER REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS reversed_by_transaction_id INTEGER REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER REFERENCES users(id);

UPDATE transactions
SET created_by_user_id = user_id
WHERE created_by_user_id IS NULL;

UPDATE transactions
SET payment_method = CASE
  WHEN transaction_type IN ('void', 'refund') THEN COALESCE(payment_method, 'mpesa')
  WHEN mpesa_receipt_number IS NOT NULL THEN 'mpesa'
  WHEN customer_phone = 'CASH' THEN 'cash'
  ELSE COALESCE(payment_method, 'mpesa')
END
WHERE payment_method IS NULL OR payment_method NOT IN ('cash', 'mpesa');

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id),
    scope_user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id),
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);

INSERT INTO categories (name, user_id)
SELECT DISTINCT p.category, p.user_id
FROM products p
WHERE p.category IS NOT NULL
  AND TRIM(p.category) <> ''
ON CONFLICT (user_id, name) DO NOTHING;

UPDATE products p
SET category_id = c.id
FROM categories c
WHERE p.user_id = c.user_id
  AND p.category = c.name
  AND p.category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_audit_scope_time ON audit_logs(scope_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_barcode_unique
ON products(user_id, barcode)
WHERE barcode IS NOT NULL;
