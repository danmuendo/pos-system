-- Database Schema for POS System

-- Users table (for owner authentication)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    business_name VARCHAR(200),
    business_phone VARCHAR(30),
    business_address TEXT,
    business_tax_pin VARCHAR(100),
    business_logo_url TEXT,
    receipt_footer TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'cashier',
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    barcode VARCHAR(100),
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2),
    stock_quantity INTEGER DEFAULT 0,
    category VARCHAR(100),
    category_id INTEGER REFERENCES categories(id),
    image_url TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    transaction_code VARCHAR(100) UNIQUE,
    customer_phone VARCHAR(20) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    mpesa_receipt_number VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(20) NOT NULL DEFAULT 'mpesa',
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_by_user_id INTEGER REFERENCES users(id),
    transaction_type VARCHAR(20) NOT NULL DEFAULT 'sale',
    parent_transaction_id INTEGER REFERENCES transactions(id),
    reversed_by_transaction_id INTEGER REFERENCES transactions(id),
    approval_reason TEXT,
    approved_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Transaction items table
CREATE TABLE transaction_items (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL
);

-- Immutable audit logs
CREATE TABLE audit_logs (
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

-- Indexes for better performance
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_products_user ON products(user_id);
CREATE UNIQUE INDEX idx_products_user_barcode_unique
ON products(user_id, barcode)
WHERE barcode IS NOT NULL;
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_audit_scope_time ON audit_logs(scope_user_id, created_at DESC);
