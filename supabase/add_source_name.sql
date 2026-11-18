-- Run this ONCE in the Supabase SQL Editor BEFORE deploying the new code.
alter table tracks add column if not exists source_name text;
