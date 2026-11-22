-- Run ONCE in the Supabase SQL Editor BEFORE deploying the per-user channels update. Safe to run twice.
-- Needs Postgres 15 or newer (every Supabase project created since 2023 has it).
--
-- What this does:
--   1. Every account gets its own list of followed channels (user_sources). Channels and tracks stay in ONE shared pool,
--      so a channel that three people follow is stored and scanned once.
--   2. Lists only show tracks/mixes from the channels the signed-in person follows. Signed-out visitors see the "starter set"
--      (every channel that existed before this update, plus any channel an admin adds from now on).
--   3. A log of channel additions, used for the 15-new-channels-per-day limit.
--   4. Read-only share links for a person's Likes page.
--   5. Indexes that keep the filtered lists fast.

-- ---------------------------------------------------------------- starter set
alter table sources add column if not exists is_starter boolean not null default true;
-- Existing channels are all true (the default). Channels added by non-admin users are stored with is_starter = false.

-- ---------------------------------------------------------------- who follows what
create table if not exists user_sources (
  user_id    uuid not null references auth.users on delete cascade,
  source_id  uuid not null references sources on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, source_id)
);
create index if not exists user_sources_source on user_sources (source_id);
alter table user_sources enable row level security;
drop policy if exists "own follows read" on user_sources;
create policy "own follows read" on user_sources for select using (auth.uid() = user_id);
-- Writes happen on the server only (service role), so the daily limit cannot be skipped from the browser.

-- ---------------------------------------------------------------- daily add limit
create table if not exists source_add_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists source_add_log_user_time on source_add_log (user_id, created_at desc);
alter table source_add_log enable row level security;   -- no policies: server only

-- ---------------------------------------------------------------- read-only likes links
create table if not exists likes_shares (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  code       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table likes_shares enable row level security;
drop policy if exists "own share read"   on likes_shares;
drop policy if exists "own share insert" on likes_shares;
drop policy if exists "own share delete" on likes_shares;
create policy "own share read"   on likes_shares for select using (auth.uid() = user_id);
create policy "own share insert" on likes_shares for insert with check (auth.uid() = user_id);
create policy "own share delete" on likes_shares for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------- the channels each person sees
-- Signed in: the channels they follow. Signed out: the starter set.
create or replace function public.my_channels()
returns table (id uuid, name text, genre text, kind text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.genre, s.kind
  from public.sources s
  where s.kind in ('youtube', 'soundcloud')
    and ( s.id in (select us.source_id from public.user_sources us where us.user_id = auth.uid())
          or (auth.uid() is null and s.is_starter) )
$$;

create or replace function public.my_source_names()
returns setof text
language sql stable security definer set search_path = public as $$
  select c.name from public.my_channels() c
$$;

-- Tracks and mixes from those channels only. "security_invoker" keeps the existing public-read rules (published rows only) in force.
create or replace view public.my_tracks with (security_invoker = true) as
  select t.* from public.tracks t
  where t.source_name in (select public.my_source_names());

create or replace view public.my_mixes with (security_invoker = true) as
  select m.* from public.mixes m
  where m.show_or_channel in (select public.my_source_names());

create or replace view public.my_mix_channels with (security_invoker = true) as
  select distinct m.show_or_channel as name, m.genre
  from public.mixes m
  where m.show_or_channel in (select public.my_source_names());

-- Anyone with a share code can read that person's likes (and only that). Codes are 64 random characters.
create or replace function public.shared_likes(share_code text)
returns table (liked_at timestamptz, tracks jsonb)
language sql stable security definer set search_path = public as $$
  select l.liked_at, to_jsonb(t.*)
  from public.liked_tracks l
  join public.likes_shares sh on sh.user_id = l.user_id
  join public.tracks t on t.id = l.track_id
  where sh.code = share_code and t.status = 'published'
  order by l.liked_at desc, t.id
$$;

-- Channels the scheduled scan should visit: the starter set plus anything at least one person follows. Server only.
create or replace view public.scannable_sources as
  select s.* from public.sources s
  where s.is_starter or exists (select 1 from public.user_sources u where u.source_id = s.id);

-- ---------------------------------------------------------------- start with your own channels
-- Every admin account follows every channel that exists right now, so nothing changes for you.
-- (Everyone else starts empty and gets a one-click "Follow the starter channels" button.
--  To give every EXISTING account the full list too, run the commented line at the bottom.)
insert into user_sources (user_id, source_id)
select p.id, s.id from profiles p cross join sources s
where p.is_admin and s.kind in ('youtube', 'soundcloud')
on conflict do nothing;

-- ---------------------------------------------------------------- speed
create index if not exists tracks_source_released on tracks (source_name, released_on desc);
create index if not exists mixes_channel_uploaded on mixes (show_or_channel, uploaded_at desc);

-- ---------------------------------------------------------------- permissions (RLS filters rows; these let the roles touch the objects at all)
grant select on user_sources, likes_shares to authenticated;
grant insert, delete on likes_shares to authenticated;
grant select on my_tracks, my_mixes, my_mix_channels to anon, authenticated;
grant execute on function public.my_channels(), public.my_source_names() to anon, authenticated;
grant execute on function public.shared_likes(text) to anon, authenticated;
grant all on user_sources, source_add_log, likes_shares, scannable_sources to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on scannable_sources from anon, authenticated;

notify pgrst, 'reload schema';

-- Optional: give EVERY existing account the starter channels (new sign-ups still start empty). Remove the leading dashes to use it.
-- insert into user_sources (user_id, source_id) select u.id, s.id from auth.users u cross join sources s where s.is_starter and s.kind in ('youtube','soundcloud') on conflict do nothing;
