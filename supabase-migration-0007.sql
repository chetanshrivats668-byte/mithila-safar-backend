ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "partnerCollabStatus" TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "submittedFrom" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "partnerCollabRejectedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "partnerCollabReapplyAfter" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_collabs_user_id ON collaborators("userId");
CREATE INDEX IF NOT EXISTS idx_collabs_partner_collab_status ON collaborators("partnerCollabStatus");
CREATE INDEX IF NOT EXISTS idx_collabs_submitted_from ON collaborators("submittedFrom");

NOTIFY pgrst, 'reload schema';