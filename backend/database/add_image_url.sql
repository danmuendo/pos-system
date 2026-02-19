-- Migration to add image_url column to products table
-- Run this if you already have the database set up

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
