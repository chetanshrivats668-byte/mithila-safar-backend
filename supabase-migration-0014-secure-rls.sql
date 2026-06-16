-- Migration 0014: Secure RLS to prevent public access
-- Supabase flagged the database for publicly accessible tables and sensitive data exposure.
-- The Express backend uses the Service Role Key, which bypasses RLS.
-- Therefore, we can safely enable RLS on all tables and drop any permissive policies,
-- completely blocking all unauthenticated REST API access (anon key).

DO $$ 
DECLARE 
    t_name text; 
BEGIN 
    -- 1. Enable RLS on every table in the public schema
    FOR t_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t_name); 
    END LOOP; 
END $$;

-- 2. Drop the specific permissive policy that was flagged for sensitive data exposure
DROP POLICY IF EXISTS "Allow all access to sms_otps" ON public.sms_otps;

-- 3. Drop any other generic permissive policies just to be safe
DO $$ 
DECLARE 
    t_name text; 
BEGIN 
    FOR t_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
        EXECUTE format('DROP POLICY IF EXISTS allow_all ON public.%I;', t_name); 
    END LOOP; 
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
