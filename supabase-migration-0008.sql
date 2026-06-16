-- First ensure the table exists (in case migration 0004 was never run)
CREATE TABLE IF NOT EXISTS public.collab_applications (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "googleEmail" TEXT,
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

-- Just in case it existed but didn't have googleEmail
ALTER TABLE public.collab_applications
  ADD COLUMN IF NOT EXISTS "googleEmail" TEXT;

-- Now add the missing columns to collaborators
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS "googleEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "upiId" TEXT,
  ADD COLUMN IF NOT EXISTS "aadhaarId" TEXT,
  ADD COLUMN IF NOT EXISTS "yearsOfExperience" TEXT,
  ADD COLUMN IF NOT EXISTS "routeCities" JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "operatingCity" TEXT,
  ADD COLUMN IF NOT EXISTS "landmark" TEXT,
  ADD COLUMN IF NOT EXISTS "pinCode" TEXT;

-- Enable Row Level Security for collab_applications and remove permissive policies.
ALTER TABLE public.collab_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.collab_applications;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collab_apps_email ON public.collab_applications("email");
CREATE INDEX IF NOT EXISTS idx_collab_apps_phone ON public.collab_applications("phone");
CREATE INDEX IF NOT EXISTS idx_collab_apps_status ON public.collab_applications("status");

NOTIFY pgrst, 'reload schema';
