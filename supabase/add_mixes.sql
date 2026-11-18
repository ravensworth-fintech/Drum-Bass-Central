-- Run ONCE in the Supabase SQL Editor BEFORE deploying the new code.
alter table mixes add column if not exists tracklist_checked_at timestamptz;
alter table mixes add column if not exists tracklist_origin text;
create index if not exists mixes_uploaded on mixes (uploaded_at desc);

-- Make sure the public site can read mixes and their tracklists.
alter table mixes enable row level security;
drop policy if exists "public read published" on mixes;
create policy "public read published" on mixes for select using (status = 'published');
alter table tracklist_entries enable row level security;
drop policy if exists "public read" on tracklist_entries;
create policy "public read" on tracklist_entries for select using (true);
grant select on mixes, tracklist_entries to anon, authenticated;
