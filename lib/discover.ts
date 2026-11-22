// SERVER ONLY. The daily Discover job: finds artists credited on tracks already on the site who are not followed yet,
// looks up their YouTube channel, and saves it to `source_suggestions` for you to Add or Skip on the Discover page.
// Every suggestion's "reason" is a plain fact from your own data (how many tracks the artist is credited on). Nothing is generated.
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, namesMatch, resolveByName } from "@/lib/youtube-feed";
import { GenreKey } from "@/lib/genres";

type SB = ReturnType<typeof admin>;

const fold = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u00C0-\uFFFF]+/g, "");
/** Stable key for "is this the same artist/channel name". Used by the suggestions table and by remove-source. */
export const nameKeyOf = (name: string) => fold(name);

// "A & B", "A x B", "A, B", "A feat. B", "A vs B": each person or act is its own candidate.
const SPLIT = /\s*(?:,|&|\+|\bx\b|\band\b|\bvs\.?|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/i;
const partsOf = (artist: string) => artist.split(SPLIT).map((p) => p.trim()).filter((p) => p.length >= 3 && p.length <= 40);

const MIN_CREDITS = 2;          // an artist must be credited on at least this many tracks here to be suggested
const MAX_STALE_DAYS = 365;     // a channel with no upload in this long is not suggested

class QuotaError extends Error {}

type Hit = { id: string; title: string; thumb: string | null; desc: string | null };

/** Official YouTube Data API channel search. Costs 100 quota units per call, so the job caps how many it makes. */
async function searchChannels(name: string, apiKey: string): Promise<Hit[]> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=5&q=${encodeURIComponent(name)}&key=${apiKey}`, {
    signal: AbortSignal.timeout(12000), cache: "no-store",
  });
  if (res.status === 403) throw new QuotaError("YouTube API refused the search (daily quota used up, or the key is not allowed to use the YouTube Data API v3).");
  if (!res.ok) throw new Error(`YouTube search returned HTTP ${res.status}`);
  const json = await res.json();
  return (json.items ?? []).map((it: { id?: { channelId?: string }; snippet?: { channelId?: string; channelTitle?: string; title?: string; description?: string; thumbnails?: Record<string, { url?: string }> } }) => ({
    id: it.snippet?.channelId ?? it.id?.channelId ?? "",
    title: it.snippet?.channelTitle ?? it.snippet?.title ?? "",
    thumb: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
    desc: it.snippet?.description ?? null,
  })).filter((h: Hit) => /^UC[\w-]{22}$/.test(h.id) && h.title);
}

/** Subscriber count (1 quota unit). Hidden counts and any failure just return null. */
async function subscriberCount(id: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${id}&key=${apiKey}`, { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!res.ok) return null;
    const s = (await res.json()).items?.[0]?.statistics;
    return s && !s.hiddenSubscriberCount ? Number(s.subscriberCount) : null;
  } catch { return null; }
}

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max: number): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) { // Supabase returns at most 1000 rows per request
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function runDiscover(sb: SB, opts: { maxSearches?: number } = {}) {
  const maxSearches = Math.min(Math.max(opts.maxSearches ?? 10, 1), 25);
  const apiKey = process.env.YOUTUBE_API_KEY;

  // What is already followed (by channel ID and by name, including each half of "A & B" so "Camo" is not suggested when "Camo & Krooked" is followed).
  const { data: srcs, error: srcErr } = await sb.from("sources").select("name,platform_id");
  if (srcErr) throw new Error(srcErr.message);
  const haveIds = new Set((srcs ?? []).map((s) => s.platform_id as string | null).filter(Boolean) as string[]);
  const haveKeys = new Set<string>();
  for (const s of srcs ?? []) {
    haveKeys.add(fold(s.name as string));
    partsOf(s.name as string).forEach((p) => haveKeys.add(fold(p)));
  }

  // What was already suggested, skipped, removed or checked: never repeat any of it.
  const { data: known, error: knownErr } = await sb.from("source_suggestions").select("name_key,platform_id");
  if (knownErr) throw new Error(`${knownErr.message}. Run supabase/add_discover.sql in the Supabase SQL Editor first.`);
  const knownKeys = new Set((known ?? []).map((k) => k.name_key as string));
  const knownIds = new Set((known ?? []).map((k) => k.platform_id as string | null).filter(Boolean) as string[]);

  // Count credits per artist across the published tracks (newest first, up to 3000).
  const tracks = await allRows<{ artist_name: string; title: string; genre: string }>(
    (from, to) => sb.from("tracks").select("artist_name,title,genre").eq("status", "published").order("created_at", { ascending: false }).range(from, to), 3000);
  type Cand = { name: string; count: number; genres: Map<string, number>; titles: string[] };
  const cands = new Map<string, Cand>();
  for (const t of tracks) {
    for (const part of new Set(partsOf(t.artist_name))) {
      const key = fold(part);
      if (!key || haveKeys.has(key) || knownKeys.has(key)) continue;
      const c: Cand = cands.get(key) ?? { name: part, count: 0, genres: new Map<string, number>(), titles: [] };
      c.count++;
      c.genres.set(t.genre, (c.genres.get(t.genre) ?? 0) + 1);
      if (c.titles.length < 3) c.titles.push(t.title);
      cands.set(key, c);
    }
  }
  const ranked = Array.from(cands.entries()).filter(([, c]) => c.count >= MIN_CREDITS).sort((a, b) => b[1].count - a[1].count).slice(0, maxSearches);

  const suggested: string[] = [];
  let unmatched = 0, searches = 0, stoppedEarly = "";
  for (const [key, c] of ranked) {
    const genre = (Array.from(c.genres.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "dnb") as GenreKey;
    const reason = `Credited on ${c.count} tracks here, e.g. ${c.titles.map((t) => `"${t}"`).join(", ")}`;
    const base = { name: c.name, name_key: key, genre, reason, evidence_count: c.count };
    const markUnmatched = async (why: string) => { unmatched++; await sb.from("source_suggestions").upsert({ ...base, status: "unmatched", reason: why }, { onConflict: "name_key", ignoreDuplicates: true }); };
    try {
      let id = "", title = "", thumb: string | null = null, desc: string | null = null;
      if (apiKey) {
        searches++;
        const hits = (await searchChannels(c.name, apiKey)).filter((h) => namesMatch(c.name, h.title));
        hits.sort((a, b) => Number(/topic$/i.test(a.title)) - Number(/topic$/i.test(b.title))); // the artist's own channel before the auto-generated "- Topic" one
        const hit = hits[0];
        if (!hit) { await markUnmatched("No YouTube channel with this exact name"); continue; }
        ({ id, title, thumb, desc } = hit);
      } else {
        searches++;
        try { id = await resolveByName(c.name, genre); } // no API key: falls back to YouTube's search page, exact name match only
        catch { await markUnmatched("No YouTube channel with this exact name"); continue; }
      }
      if (haveIds.has(id) || knownIds.has(id)) { await markUnmatched("Channel is already followed or was already suggested"); continue; }

      const feed = await fetchChannelFeed(id);
      const latest = feed.entries.map((e) => e.publishedAt).filter(Boolean).sort().pop() ?? null;
      if (!feed.entries.length || (latest && Date.now() - Date.parse(latest) > MAX_STALE_DAYS * 86400_000)) { await markUnmatched("Channel has no recent uploads"); continue; }

      const subs = apiKey ? await subscriberCount(id, apiKey) : null;
      const { error } = await sb.from("source_suggestions").insert({
        ...base, name: title || feed.title || c.name, platform_id: id, url: `https://www.youtube.com/channel/${id}`,
        thumbnail_url: thumb ?? (feed.entries[0] ? `https://i.ytimg.com/vi/${feed.entries[0].videoId}/hqdefault.jpg` : null),
        subscribers: subs, description: desc ? desc.slice(0, 240) : null, last_upload_at: latest, status: "pending",
      });
      if (error) { await markUnmatched("Could not save this suggestion"); continue; }
      knownIds.add(id);
      suggested.push(title || feed.title || c.name);
    } catch (e) {
      if (e instanceof QuotaError) { stoppedEarly = e.message; break; }
      unmatched++; // network hiccup or a name the search page could not match: skipped for today, tried again tomorrow
    }
  }
  return { credited_artists_checked: cands.size, searched: searches, suggested, unmatched, ...(stoppedEarly ? { stopped_early: stoppedEarly } : {}) };
}
