-- Run ONCE in the Supabase SQL Editor BEFORE deploying the Dashboard / Discover update. Safe to run twice.
-- Holds the channels the daily Discover job suggests, and what you decided about each one.
create table if not exists source_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,              -- folded name, so the same artist is never suggested twice
  platform_id text unique,                    -- YouTube channel ID (UC...)
  url text,
  genre text not null default 'dnb' check (genre in ('dnb','house','dubstep','bands')),
  reason text,                                -- plain facts from your own data, e.g. "Credited on 6 tracks here"
  evidence_count int not null default 0,
  thumbnail_url text,
  subscribers bigint,
  description text,
  last_upload_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','rejected','unmatched')),
  found_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists source_suggestions_status on source_suggestions (status, evidence_count desc);

-- Same rule as sources: no policies = nobody but the server (service-role key) can read or write it.
alter table source_suggestions enable row level security;

notify pgrst, 'reload schema';
