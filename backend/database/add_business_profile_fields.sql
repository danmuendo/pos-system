-- Add business profile fields for branded receipts
-- Apply on existing databases:
-- psql -U postgres -d pos_db -f backend/database/add_business_profile_fields.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS business_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS business_tax_pin VARCHAR(100),
  ADD COLUMN IF NOT EXISTS business_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
