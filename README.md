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
Run it by hand: `https://YOUR-SITE.vercel.app/api/ingest?secret=YOUR_CRON_SECRET`. A Supabase schedule calls it every 2 hours (see "Dashboard, Discover and the 2-hour schedule" below).
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
Every source, track and mix has a `genre` (`dnb` or `house`). Tabs: Fresh Fire (all genres except Bands, newest first), D&B, House, Dubstep, Bands, Mixes (filter All / D&B / House / Dubstep), Likes.
Each list shows 30 and "Load more" fetches the next 30. `/tracks` redirects to `/dnb`.
Setup, in the Supabase SQL Editor, in this order: `supabase/add_house.sql` (adds the genre columns; existing rows stay D&B), then `supabase/seed_house.sql`
(artists, labels and mix channels). Then open `/api/ingest?secret=...` repeatedly until `not_reached_run_again` is gone.
Add a single House channel later: `/api/ingest?secret=...&name=Name&add=https://www.youtube.com/@Handle&genre=house`.

## ADD + button (admins only)
Run `supabase/make_me_admin.sql` once (with your login email) so your account has `profiles.is_admin = true`. The ADD + button then appears on the Dashboard page.
Paste a YouTube channel link, pick D&B or House, and the site adds it to `sources`, scans it immediately (its newest ~15 uploads) and reloads.
The route `/api/add-source` checks your login and `is_admin` on the server, so nobody else can add sources. Needs `SUPABASE_SERVICE_ROLE_KEY`.

## Bands (third genre)
Run `supabase/add_bands.sql` once. The Bands tab shows only channels added with the Bands option in ADD +. It is tracks-only (no mixes), is left out of Fresh Fire,
and appears in the Likes toggle. Tick "artist's own channel" for a band's own channel so uploads titled just with the song name get the band as artist.

## INGEST button (admins only)
On the Dashboard page, next to ADD +. Scans every enabled channel, works through the whole list in rounds (each round is one ~40 second server run), then reloads the page.
It uses your sign-in (`/api/run-ingest`), so no secret goes in the address bar. The scheduled run (Supabase pg_cron) is separate and calls `/api/ingest` with `CRON_SECRET`.

## SoundCloud (RSS)
ADD + accepts a `soundcloud.com/artist` link (or a `feeds.soundcloud.com/users/soundcloud:users:ID/sounds.rss` link). The account becomes a `soundcloud` source and is scanned
through its public RSS feed (newest uploads only), with the same track/mix sorting and de-duplication as YouTube. SoundCloud tracks play in the site's player through SoundCloud's
official Widget API. SoundCloud mixes get no automatic tracklist lookup (that job reads YouTube comments).

## Day dividers
Track tabs (Fresh Fire, D&B, House, Dubstep, Bands) group songs under a thin dated line by release date; Mixes group by upload date; Likes group by date liked or date posted (when sorted by either).

## Dubstep (fourth genre)
Run `supabase/add_dubstep.sql` once, then `supabase/seed_dubstep.sql` (UKF Dubstep, Circus Records, Zeds Dead, Oliverse and more; handles are guesses that are checked by channel name on the first scan).
Then press INGEST (or open `/api/ingest?secret=...` repeatedly). The ADD + button has a Dubstep option. Dubstep shows on Fresh Fire; to keep it off Fresh Fire, remove `"dubstep"` from `DISCOVER_GENRES` in `lib/genres.ts`.

## Up Next (queue)
Every playable song and mix has a "+ Next" button (a list-with-plus icon on phones). Songs you add play next, in the order you add them. When the queue runs out, playback continues from the song after the last one that came from a list.
The queue button in the player bar (list icon, with a count) shows what's queued and lets you remove songs or clear it. Closing the player clears the queue; the queue is not saved across page reloads.

## Keyboard shortcuts
Space = play/pause, L = like, left/right arrows = back/forward 5 seconds (works on every page while a song is loaded; ignored while typing in a field).

## Dashboard, Discover and the 2-hour schedule
**Header (right side):** `Likes` (lime outline, same look as the old INGEST button) and `Dashboard` (same look as the genre buttons). Signed-out visitors see `Likes` and `Sign in`.
The Likes link no longer appears in the left-hand links or the phone's bottom tab bar (the bar now has 6 tabs).

**Dashboard (`/dashboard`)** replaces the old Account menu:
- Account: your email, Desktop/Mobile site switch, Sign out.
- Track list PDF: pick Fresh Fire, D&B, House, Dubstep, Bands or Likes and download "Artist - Title" for the newest 1,000 tracks (or all likes).
  This replaces the old menu's "Download PDF", which exported whatever list the page you were on was showing (filters applied). `usePublishPdf` is still called by the list pages but nothing reads it any more.
- Channels (admins): INGEST and ADD +, unchanged, plus a link to Discover with a count of waiting suggestions.
- Followed channels (admins): every YouTube and SoundCloud source with its genre, last scan time and a "last scan failed" flag. Search and genre filter.
  **Remove** deletes the source row (and its scan log) so it is no longer scanned. Tracks and mixes already on the site stay, unless you tick "Also hide its tracks and mixes",
  which sets them to `rejected` (hidden, not deleted; likes on those tracks stop showing). A removed channel is remembered so Discover never suggests it again.

**Discover (`/discover`, admins only):** the daily job (`/api/discover`) counts the artists credited on published tracks, skips anyone already followed (including each half of "A & B"),
and for the top 10 who are credited on at least 2 tracks looks up their YouTube channel with the official search (`YOUTUBE_API_KEY`, 100 quota units per search; without a key it falls back to YouTube's search page).
A channel is only suggested when its name matches exactly and it has uploaded within the last year. Each card shows the facts (credits, subscribers, last upload, the channel's own description), a genre choice,
an "artist's own channel" tick and Add / Skip. Add follows the channel and scans it now. Skip is remembered. Run `supabase/add_discover.sql` once first.
By hand: `/api/discover?secret=YOUR_CRON_SECRET` (add `&max=3` to cap the searches).

**Schedule (free, on Supabase):** run `supabase/schedule_ingest.sql` once, after putting your `CRON_SECRET` in it. It creates four pg_cron jobs that call your site with pg_net:
ingest every 2 hours, tracklists daily, Discover daily, and a daily cleanup that keeps 14 days of scan logs. `vercel.json` no longer has any crons, so **nothing is scheduled until that SQL has been run**.
Ingest now skips videos that are already saved before asking YouTube for runtimes, which keeps API quota use low.
