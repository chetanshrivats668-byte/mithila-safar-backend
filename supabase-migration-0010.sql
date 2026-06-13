-- Migration 0010: Add totalRooms to collab_applications and collaborators
-- Created: 2026-06-12

ALTER TABLE public.collab_applications ADD COLUMN IF NOT EXISTS "totalRooms" INTEGER DEFAULT 0;
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS "totalRooms" INTEGER DEFAULT 0;

NOTIFY pgrst, 'reload schema';
