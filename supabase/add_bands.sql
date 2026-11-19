-- Run ONCE in the Supabase SQL Editor BEFORE deploying the Bands update. Safe to run twice.
-- Lets sources, tracks and mixes have the genre 'bands' (in addition to 'dnb' and 'house').
alter table sources drop constraint if exists sources_genre_check;
alter table tracks  drop constraint if exists tracks_genre_check;
alter table mixes   drop constraint if exists mixes_genre_check;
alter table sources add constraint sources_genre_check check (genre in ('dnb','house','bands'));
alter table tracks  add constraint tracks_genre_check  check (genre in ('dnb','house','bands'));
alter table mixes   add constraint mixes_genre_check   check (genre in ('dnb','house','bands'));
notify pgrst, 'reload schema';
