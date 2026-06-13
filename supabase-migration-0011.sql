-- Migration 0011: Add service creation details for Cabs, Hotels, and Cafes
-- Created: 2026-06-12

-- Cab additions
ALTER TABLE public.collaborator_cabs ADD COLUMN IF NOT EXISTS "totalSeats" INTEGER DEFAULT 4;
ALTER TABLE public.collaborator_cabs ADD COLUMN IF NOT EXISTS "ownerAadhaarId" TEXT DEFAULT '';

-- Hotel additions
ALTER TABLE public.collaborator_hotels ADD COLUMN IF NOT EXISTS "state" TEXT DEFAULT '';
ALTER TABLE public.collaborator_hotels ADD COLUMN IF NOT EXISTS "totalRooms" INTEGER DEFAULT 0;
ALTER TABLE public.collaborator_hotels ADD COLUMN IF NOT EXISTS "ownerAadhaarId" TEXT DEFAULT '';
ALTER TABLE public.collaborator_hotels ADD COLUMN IF NOT EXISTS "phone" TEXT DEFAULT '';

-- Cafe additions
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "state" TEXT DEFAULT '';
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "capacity" INTEGER DEFAULT 0;
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "location" TEXT DEFAULT '';
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "price" INTEGER DEFAULT 0;
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "ownerAadhaarId" TEXT DEFAULT '';
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "phone" TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
