-- Phase 1 schema. Metadata + embed references only; no audio is stored.
create extension if not exists pg_trgm;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('rss','youtube','soundcloud','mixcloud','bandcamp','spotify','1001tl','manual')),
  url text not null unique,
  platform_id text,
  enabled boolean not null default true,
  scan_interval_minutes int not null default 180,
  monitorable text not null default 'auto' check (monitorable in ('auto','needs_credentials','manual_only')),
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);

create table artists (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique, image_url text, links jsonb default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table labels (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique, image_url text, website text, links jsonb default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table releases (
  id uuid primary key default gen_random_uuid(),
  title text not null, kind text check (kind in ('single','ep','album','remix','compilation')),
  label_id uuid references labels, released_on date, artwork_url text,
  source_url text not null unique, platform_id text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null, artist_name text not null,           -- denormalised for fast lists/PDF
  artist_id uuid references artists, label_id uuid references labels, release_id uuid references releases,
  subgenre text not null default 'Unknown'
    check (subgenre in ('Liquid','Dancefloor','Neurofunk','Jump Up','Jungle','Minimal','Deep','Techstep','Rollers','Drumfunk','Atmospheric','Unknown')),
  released_on date, artwork_url text,
  source_url text not null unique, platform text, platform_id text,
  embed_url text, status text not null default 'pending' check (status in ('pending','published','rejected')),
  dedupe_key text generated always as (lower(artist_name) || '|' || lower(title)) stored,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (platform, platform_id)
);
create index tracks_dedupe on tracks (dedupe_key);
create index tracks_search on tracks using gin ((title || ' ' || artist_name) gin_trgm_ops);

create table mixes (
  id uuid primary key default gen_random_uuid(),
  title text not null, dj_name text, show_or_channel text, uploaded_at timestamptz, duration_seconds int,
  artwork_url text, source_url text not null unique, platform text, platform_id text, embed_url text,
  tracklist_status text not null default 'none' check (tracklist_status in ('none','matched','needs_review')),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (platform, platform_id)
);
create table tracklist_entries (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references mixes on delete cascade,
  position int not null, artist_name text, title text, label_name text, timestamp_seconds int,
  track_id uuid references tracks,                         -- set only when identity is verified
  tracklist_source_url text not null,
  unique (mix_id, position)
);
create table tracklist_candidates (                         -- uncertain matches -> admin review queue
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references mixes on delete cascade,
  candidate_url text not null, confidence numeric(4,3) not null, signals jsonb,
  resolved boolean not null default false, created_at timestamptz default now(),
  unique (mix_id, candidate_url)
);
create table articles (
  id uuid primary key default gen_random_uuid(),
  headline text not null, publication text, author text, published_at timestamptz, thumbnail_url text,
  source_url text not null unique, status text not null default 'pending',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table scan_history (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources on delete cascade, started_at timestamptz default now(), finished_at timestamptz,
  ok boolean, items_found int default 0, items_new int default 0, error text
);

create table liked_tracks (
  user_id uuid not null references auth.users on delete cascade,
  track_id uuid not null references tracks on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (user_id, track_id)                           -- prevents duplicate likes
);
create index liked_by_user_time on liked_tracks (user_id, liked_at desc);

-- RLS
alter table liked_tracks enable row level security;
create policy "own likes read"   on liked_tracks for select using (auth.uid() = user_id);
create policy "own likes insert" on liked_tracks for insert with check (auth.uid() = user_id);
create policy "own likes delete" on liked_tracks for delete using (auth.uid() = user_id);

alter table tracks enable row level security;
create policy "public read published" on tracks for select using (status = 'published');
alter table mixes enable row level security;
create policy "public read published" on mixes for select using (status = 'published');
alter table articles enable row level security;
create policy "public read published" on articles for select using (status = 'published');
alter table tracklist_entries enable row level security;
create policy "public read" on tracklist_entries for select using (true);
-- Ingestion and admin writes use the service-role key server-side; admin UI checks profiles.is_admin.

-- Lock down the remaining tables (Supabase exposes every public table to the API; RLS off = open to anyone with the anon key).
alter table profiles            enable row level security;
alter table sources             enable row level security;
alter table scan_history        enable row level security;
alter table tracklist_candidates enable row level security;
alter table artists             enable row level security;
alter table labels              enable row level security;
alter table releases            enable row level security;

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "public read" on artists  for select using (true);
create policy "public read" on labels   for select using (true);
create policy "public read" on releases for select using (true);
-- sources, scan_history, tracklist_candidates, and all writes: no policies = no access for anon/users.
-- Ingestion and the admin pages use the service-role key on the server, which bypasses RLS.
