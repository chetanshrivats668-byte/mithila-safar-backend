-- Migration 0016: Add preferredCollaboratorId column to users table
-- Created: 2026-06-17

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "preferredCollaboratorId" TEXT;

-- Index for faster lookup if preferred collaborator queries are performed
CREATE INDEX IF NOT EXISTS idx_users_preferred_collab ON public.users("preferredCollaboratorId");

NOTIFY pgrst, 'reload schema';
