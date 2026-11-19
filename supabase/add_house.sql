-- Run ONCE in the Supabase SQL Editor BEFORE deploying the House update. Safe to run twice.
-- Adds a genre ('dnb' or 'house') to sources, tracks and mixes. Everything that already exists stays D&B.
alter table sources add column if not exists genre text not null default 'dnb';
alter table tracks  add column if not exists genre text not null default 'dnb';
alter table mixes   add column if not exists genre text not null default 'dnb';

alter table sources drop constraint if exists sources_genre_check;
alter table tracks  drop constraint if exists tracks_genre_check;
alter table mixes   drop constraint if exists mixes_genre_check;
alter table sources add constraint sources_genre_check check (genre in ('dnb','house'));
alter table tracks  add constraint tracks_genre_check  check (genre in ('dnb','house'));
alter table mixes   add constraint mixes_genre_check   check (genre in ('dnb','house'));

create index if not exists tracks_genre_released on tracks (genre, released_on desc);
create index if not exists mixes_genre_uploaded  on mixes  (genre, uploaded_at desc);

notify pgrst, 'reload schema';
