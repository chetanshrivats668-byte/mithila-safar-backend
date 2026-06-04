-- Add missing columns to collaborator_cabs
ALTER TABLE collaborator_cabs ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE collaborator_cabs ADD COLUMN IF NOT EXISTS "rating" NUMERIC DEFAULT 4.0;

-- Add missing columns to collaborator_hotels
ALTER TABLE collaborator_hotels ADD COLUMN IF NOT EXISTS "rating" NUMERIC DEFAULT 4.0;

-- Add missing columns to collaborator_cafes
ALTER TABLE collaborator_cafes ADD COLUMN IF NOT EXISTS "rating" NUMERIC DEFAULT 4.0;
ALTER TABLE collaborator_cafes ADD COLUMN IF NOT EXISTS "costPerSeat" NUMERIC DEFAULT 50;
