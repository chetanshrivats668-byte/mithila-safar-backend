-- Enable RLS on all tables and remove permissive policies.
-- Application access should happen through the server using the service-role key,
-- while anon/authenticated browser roles stay denied by default.

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
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON public.%I;', tbl);
  END LOOP;
END $$;
