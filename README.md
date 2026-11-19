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

## House (second genre)
Every source, track and mix has a `genre` (`dnb` or `house`). Tabs: Discover (both genres, newest first), D&B, House, Mixes (filter All / D&B / House).
Each list shows 30 and "Load more" fetches the next 30. `/tracks` redirects to `/dnb`.
Setup, in the Supabase SQL Editor, in this order: `supabase/add_house.sql` (adds the genre columns; existing rows stay D&B), then `supabase/seed_house.sql`
(artists, labels and mix channels). Then open `/api/ingest?secret=...` repeatedly until `not_reached_run_again` is gone.
Add a single House channel later: `/api/ingest?secret=...&name=Name&add=https://www.youtube.com/@Handle&genre=house`.

## ADD + button (admins only)
Run `supabase/make_me_admin.sql` once (with your login email) so your account has `profiles.is_admin = true`. The ADD + button then appears next to Sign out.
Paste a YouTube channel link, pick D&B or House, and the site adds it to `sources`, scans it immediately (its newest ~15 uploads) and reloads.
The route `/api/add-source` checks your login and `is_admin` on the server, so nobody else can add sources. Needs `SUPABASE_SERVICE_ROLE_KEY`.

## Bands (third genre)
Run `supabase/add_bands.sql` once. The Bands tab shows only channels added with the Bands option in ADD +. It is tracks-only (no mixes), is left out of Discover,
and appears in the Likes toggle. Tick "artist's own channel" for a band's own channel so uploads titled just with the song name get the band as artist.

## INGEST button (admins only)
Next to ADD +. Scans every enabled channel, works through the whole list in rounds (each round is one ~40 second server run), then reloads the page.
It uses your sign-in (`/api/run-ingest`), so no secret goes in the address bar. The scheduled run in `vercel.json` is separate and still calls `/api/ingest` with `CRON_SECRET`.
