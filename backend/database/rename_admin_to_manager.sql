-- Migration: rename role 'admin' → 'manager', fix owner role bug
--
-- The first registered user was incorrectly stored with role='admin'.
-- They are identified by owner_user_id = id (self-referencing).
-- Step 1: promote them to 'owner'.
UPDATE users
SET role = 'owner'
WHERE role = 'admin'
  AND owner_user_id = id;

-- Step 2: rename any remaining 'admin' employees to 'manager'.
UPDATE users
SET role = 'manager'
WHERE role = 'admin';
