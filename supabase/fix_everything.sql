-- ONE file that fixes the missing columns behind "Could not find the 'duration_seconds' column" and prepares the rest.
-- Run the whole thing in the Supabase SQL Editor. Safe to run more than once.

alter table tracks  add column if not exists source_name text;
alter table tracks  add column if not exists norm_key text;
create index if not exists tracks_norm_key on tracks (norm_key);
alter table tracks  add column if not exists duration_seconds int;
alter table mixes   add column if not exists tracklist_checked_at timestamptz;
alter table mixes   add column if not exists tracklist_origin text;
alter table sources add column if not exists is_artist boolean not null default false;

-- Artist channels title uploads with just the track name, so the app uses the channel's name as the artist.
update sources set is_artist = true where name in ('Sub Focus', 'Dimension', 'Culture Shock', '1991', 'Metrik', 'Wilkinson', 'Grafix', 'Kanine', 'Delta Heavy', 'Netsky', 'Chase & Status', 'Pendulum', 'Friction', 'Koven', 'Andromedik', 'Fox Stevenson', 'MUZZ', 'ShockOne', 'Feint', 'Maduk', 'Fred V', 'Camo & Krooked', 'T & Sugah', 'Pirapus', 'Ekko & Sidetrack', 'ROVA', 'Sless', 'Subsonic', 'A.M.C', 'Sota', 'Hedex', 'Bou', 'Simula', 'Circadian', 'Mefjus', 'Noisia', 'Phace', 'The Upbeats', 'Buunshin', 'Teddy Killerz', 'Turno', 'K Motionz', 'Disrupta', 'Basstripper', 'Serum', 'Upgrade', 'Skantia', 'DC Breaks', 'Tantrum Desire', 'VISION', 'Dom Whiting', 'ESKEI83');

-- Med School Music uploads to the Hospital Records channel, which is already a source.
delete from sources where name = 'Med School Music';

-- Make the API see the new columns straight away.
notify pgrst, 'reload schema';
