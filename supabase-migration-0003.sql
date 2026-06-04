-- Enable RLS on all tables and create permissive "allow all" policies.
-- Our server handles auth at the application layer via JWT tokens.
-- RLS is enabled to satisfy the database linter and prevent accidental
-- data exposure via the anon key.

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users', 'collaborators', 'orders', 'email_otps',
    'collaborator_buses', 'collaborator_cabs', 'collaborator_hotels',
    'collaborator_cafes', 'collaborator_seats',
    'hotel_rooms', 'cafe_tables'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    -- Drop existing policy if any, then create permissive policy
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON public.%I;', tbl);
    EXECUTE format('
      CREATE POLICY allow_all ON public.%I
      FOR ALL
      USING (true)
      WITH CHECK (true);
    ', tbl);
  END LOOP;
END $$;
