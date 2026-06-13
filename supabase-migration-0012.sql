-- Migration 0012: Add onboarding capacity, totalSeats, servicePhone, driverPhone
-- Created: 2026-06-12

ALTER TABLE public.collab_applications ADD COLUMN IF NOT EXISTS "capacity" INTEGER DEFAULT 0;
ALTER TABLE public.collab_applications ADD COLUMN IF NOT EXISTS "totalSeats" INTEGER DEFAULT 0;
ALTER TABLE public.collab_applications ADD COLUMN IF NOT EXISTS "servicePhone" TEXT DEFAULT '';
ALTER TABLE public.collab_applications ADD COLUMN IF NOT EXISTS "driverPhone" TEXT DEFAULT '';

ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS "capacity" INTEGER DEFAULT 0;
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS "totalSeats" INTEGER DEFAULT 0;
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS "servicePhone" TEXT DEFAULT '';
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS "driverPhone" TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
