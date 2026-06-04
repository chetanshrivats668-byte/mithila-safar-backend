-- ========================================================
-- Migration: Create collab_applications table
-- Run this in your Supabase SQL Editor
-- Quoted identifiers preserve camelCase matching our model fields.
-- ========================================================

CREATE TABLE IF NOT EXISTS public.collab_applications (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "phone" TEXT DEFAULT '',
  "password" TEXT,
  "serviceCategory" TEXT NOT NULL,
  "upiId" TEXT DEFAULT '',
  "aadhaarId" TEXT DEFAULT '',
  "yearsOfExperience" TEXT DEFAULT '',
  "experience" TEXT DEFAULT '',
  "documents" TEXT DEFAULT '',
  "routeCities" JSONB DEFAULT '[]',
  "operatingCity" TEXT DEFAULT '',
  "serviceAddress" TEXT DEFAULT '',
  "serviceCity" TEXT DEFAULT '',
  "serviceState" TEXT DEFAULT '',
  "serviceLandmark" TEXT DEFAULT '',
  "servicePincode" TEXT DEFAULT '',
  "status" TEXT DEFAULT 'pending',
  "verificationStatus" TEXT DEFAULT 'pending',
  "adminNotes" TEXT DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.collab_applications ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policy if any, then create a permissive "allow all" policy
DROP POLICY IF EXISTS allow_all ON public.collab_applications;
CREATE POLICY allow_all ON public.collab_applications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_collab_apps_email ON public.collab_applications("email");
CREATE INDEX IF NOT EXISTS idx_collab_apps_phone ON public.collab_applications("phone");
CREATE INDEX IF NOT EXISTS idx_collab_apps_status ON public.collab_applications("status");

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
