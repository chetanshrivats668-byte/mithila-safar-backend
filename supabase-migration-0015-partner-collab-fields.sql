-- Migration 0015: Add Partner Collaboration fields to collaborators table
-- Created: 2026-06-17
-- These fields are required for the partner collaboration submission and auto-redirect feature

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS "partnerCollabStatus" TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "submittedFrom" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "partnerCollabRejectedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "partnerCollabReapplyAfter" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Indexes for faster lookup
CREATE INDEX IF NOT EXISTS idx_collabs_partner_collab_status ON public.collaborators("partnerCollabStatus");
CREATE INDEX IF NOT EXISTS idx_collabs_submitted_from ON public.collaborators("submittedFrom");

NOTIFY pgrst, 'reload schema';