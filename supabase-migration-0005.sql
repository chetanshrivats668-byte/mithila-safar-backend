-- Migration 0005: SMS OTP persistent storage table
-- Replaces in-memory-only otpStore Map in server.js with Supabase-backed storage
-- Used by utils/otp/smsOtpHelper.js

CREATE TABLE IF NOT EXISTS public.sms_otps (
  "id" TEXT PRIMARY KEY,
  "otpCode" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "attemptsCount" INTEGER DEFAULT 0,
  "sendCount" INTEGER DEFAULT 1,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sms_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to sms_otps" ON public.sms_otps;
CREATE POLICY "Allow all access to sms_otps" ON public.sms_otps FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sms_otps_expiresat ON public.sms_otps("expiresAt");

NOTIFY pgrst, 'reload schema';