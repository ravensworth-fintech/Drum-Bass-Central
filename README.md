# D&B Discovery Platform

## Architecture
Next.js (App Router) + Tailwind on Vercel; Supabase Postgres/Auth/RLS; ingestion as separate connector
modules (one per source kind) run by Supabase scheduled functions (pg_cron -> Edge Function) every 3h.
Each connector writes to `scan_history`; one failing source never stops the others.
Dedupe order: canonical URL -> (platform, platform_id) -> artist|title key. High-confidence items
auto-publish; uncertain ones stay `pending` / `tracklist_candidates` for admin review.

## Integration status (honest view)
| Source | Status |
|---|---|
| RSS (UKF, DnBArena, Bassblog, label blogs), Mixcloud public API, BBC programme feeds | Planned: fully automatic, no credentials |
| YouTube | Needs free Data API key |
| Spotify | Needs client credentials (metadata + embeds only) |
| SoundCloud | Embeds work; discovery depends on API access, which SoundCloud limits. Per-profile RSS where available, else manual URL |
| Bandcamp | No public API; embeds + manual/RSS-where-offered |
| 1001Tracklists | No public API; scraping not assumed. Workflow: manual tracklist URL submission + permitted metadata |
| Kool FM, Rinse FM, Mi-Soul | Depends on each show's podcast/Mixcloud feed; verify per show |

## Setup
1. Create a Supabase project, run `supabase/schema.sql`.
2. Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server only), YOUTUBE_API_KEY, SPOTIFY_CLIENT_ID/SECRET.
3. `npm i jspdf @supabase/ssr @supabase/supabase-js`

## PDF export
`<DownloadPdfButton title="New Releases" tracks={visibleTracks} />` on any list page. Exports numbered
"Artist - Title" lines for what's currently shown (filters applied). Non-Latin titles may not render with the built-in font.

## Ingestion (YouTube, no API key needed)
`/api/ingest` reads each enabled `youtube` row in `sources` via the channel's free public feed, turns
"Artist - Title" uploads into published tracks (with embed + thumbnail), skips mixes/podcasts/unparseable titles,
dedupes, and logs to `scan_history`. Needs env vars `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` (any long random string).
Run it by hand: `https://YOUR-SITE.vercel.app/api/ingest?secret=YOUR_CRON_SECRET`. Vercel Cron calls it daily (`vercel.json`).
Add channels by inserting rows into `sources` (see `supabase/seed_sources.sql`).

## Cleanup and review queue
Ingestion strips hashtags and promo text ("out now", emoji), builds a `norm_key` (ignores case, punctuation, artist order,
"&" vs ",", "(ft. X)") to skip duplicates across channels, and holds tracks whose artist looks like an event or caption as
`status = 'pending'` (hidden from the site). Approve one by setting its status to `published` in Table Editor -> tracks.
One-off tidy of existing rows (run once, after `supabase/add_norm_key.sql`): `/api/ingest?secret=YOUR_CRON_SECRET&cleanup=1`.
Duplicates are hidden (`rejected`), never deleted, and any likes on them move to the kept track.

## Login
Password sign-in, account creation, and email link/code. Supabase -> Authentication -> URL Configuration: set Site URL to your
Vercel address and add `https://YOUR-SITE.vercel.app/**` under Redirect URLs. For instant sign-up, turn off "Confirm email"
under Providers -> Email.
