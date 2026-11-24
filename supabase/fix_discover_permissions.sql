-- Fixes: "permission denied for table source_suggestions" on the Discover page.
-- Cause: add_discover.sql created the table but never granted the server's role (service_role) access to it.
-- (RLS is fine as is: service_role bypasses it, but it still needs GRANT first, like every other table here.)
-- Run the whole thing in the Supabase SQL Editor. Safe to run more than once.
grant usage on schema public to service_role;
grant all on table public.source_suggestions to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Make the API see the change straight away.
notify pgrst, 'reload schema';
