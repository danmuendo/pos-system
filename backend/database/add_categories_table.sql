-- Add first-class categories and map existing product category text
-- Apply on existing databases:
-- psql -U postgres -d pos_db -f backend/database/add_categories_table.sql

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);

CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

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
