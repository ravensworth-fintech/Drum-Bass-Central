-- Run ONCE in the Supabase SQL Editor. Safe to run twice.
-- 1) hidden_items: songs/mixes a person removed with the X button. Removal is per account (like removing a channel):
--    nobody else is affected, and re-scanning a channel never brings a removed song back.
-- 2) app_status: remembers the last ingest result (time + summary) so the Dashboard can show it.

create table if not exists hidden_items (
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null check (kind in ('track','mix')),
  item_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);
alter table hidden_items enable row level security;
drop policy if exists "own hidden read" on hidden_items;
create policy "own hidden read" on hidden_items for select using (auth.uid() = user_id);
-- Writes happen on the server only (service role).

create table if not exists app_status (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_status enable row level security;   -- no policies: server only

-- The per-person lists now skip what that person removed.
create or replace view public.my_tracks with (security_invoker = true) as
  select t.* from public.tracks t
  where t.source_name in (select public.my_source_names())
    and not exists (select 1 from public.hidden_items h where h.user_id = auth.uid() and h.kind = 'track' and h.item_id = t.id);

create or replace view public.my_mixes with (security_invoker = true) as
  select m.* from public.mixes m
  where m.show_or_channel in (select public.my_source_names())
    and not exists (select 1 from public.hidden_items h where h.user_id = auth.uid() and h.kind = 'mix' and h.item_id = m.id);

-- Permissions (RLS filters rows; these let the roles touch the tables at all)
grant select on hidden_items to anon, authenticated;   -- anon can read it but RLS returns nothing; the views need the privilege
grant select on my_tracks, my_mixes to anon, authenticated;
grant all on hidden_items, app_status to service_role;

notify pgrst, 'reload schema';
