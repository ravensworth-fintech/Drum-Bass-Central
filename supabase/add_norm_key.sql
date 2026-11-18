-- Run ONCE in the Supabase SQL Editor BEFORE deploying the new code.
alter table tracks add column if not exists norm_key text;
create index if not exists tracks_norm_key on tracks (norm_key);
