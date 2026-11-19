// Scans one YouTube source: reads its feed, sorts uploads into tracks / mixes / skipped, dedupes, saves, logs to scan_history.
// Used by the scheduled /api/ingest run and by the ADD + button (/api/add-source).
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, fetchDurations, looksLikeShort, namesMatch, normKey, parseTrack, resolveByName, resolveChannelId } from "@/lib/youtube-feed";
import { cleanMixTitle, guessDj, isMixTitle, SKIP_WORDS } from "@/lib/mixes";
import { parseTracklist, TLEntry } from "@/lib/tracklist";

export type Source = { id: string; name: string; url: string; kind?: string; platform_id: string | null; is_artist?: boolean; genre?: "dnb" | "house" | "bands" };
export type SB = ReturnType<typeof admin>;
export const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export async function saveTracklist(sb: SB, mixId: string, list: TLEntry[], sourceUrl: string, origin: "description" | "comments" | "1001tracklists") {
  await sb.from("tracklist_entries").delete().eq("mix_id", mixId);
  const { error } = await sb.from("tracklist_entries").insert(list.map((e) => ({
    mix_id: mixId, position: e.position, artist_name: e.artist, title: e.title, label_name: e.label, timestamp_seconds: e.seconds, tracklist_source_url: sourceUrl,
  })));
  if (error) throw new Error(error.message);
  await sb.from("mixes").update({ tracklist_status: "matched", tracklist_origin: origin, tracklist_checked_at: new Date().toISOString() }).eq("id", mixId);
}

export async function scanSource(sb: ReturnType<typeof admin>, src: Source) {
  const startedAt = new Date().toISOString();
  let found = 0, added = 0, skipped = 0, mixesAdded = 0, tracklistsFound = 0;
  try {
    let channelId = src.platform_id;
    let feed: Awaited<ReturnType<typeof fetchChannelFeed>> | null = null;
    if (!channelId) {
      // First scan: find the channel and check its name matches, so a wrong @handle can't pull in someone else's uploads.
      let seen = "";
      try {
        const guess = await resolveChannelId(src.url);
        const f = await fetchChannelFeed(guess);
        if (namesMatch(src.name, f.title)) { channelId = guess; feed = f; } else seen = f.title;
      } catch { /* fall through to the name search */ }
      if (!channelId) {
        try { channelId = await resolveByName(src.name, src.genre ?? "dnb"); }
        catch (e) {
          throw new Error(seen
            ? `The channel at ${src.url} is called "${seen}", which doesn't match "${src.name}", and a search found nothing better. If "${seen}" is right, rename this source to match in Supabase; otherwise set the correct url.`
            : (e instanceof Error ? e.message : String(e)));
        }
      }
      await sb.from("sources").update({ platform_id: channelId }).eq("id", src.id);
    }
    if (!feed) feed = await fetchChannelFeed(channelId);
    if (!feed.entries.length) { // YouTube sometimes returns an empty feed for a busy channel: wait a moment and ask once more
      await new Promise((r) => setTimeout(r, 1500));
      feed = await fetchChannelFeed(channelId);
    }
    if (!feed.entries.length) throw new Error(`The feed for \"${feed.title}\" returned 0 uploads, twice. Open https://www.youtube.com/channel/${channelId} to check it is the right channel and has videos. It will be retried on the next scan.`);
    const entries = feed.entries;
    found = entries.length;

    // Backfill: tag tracks added before source_name existed.
    if (entries.length) {
      await sb.from("tracks").update({ source_name: src.name }).eq("platform", "youtube").in("platform_id", entries.map((e) => e.videoId)).is("source_name", null);
    }

    // Runtimes (optional): needs YOUTUBE_API_KEY. A failure here never blocks the scan.
    const durations = new Map<string, number>();
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey && entries.length) {
      try { (await fetchDurations(entries.map((e) => e.videoId), apiKey)).forEach((v, k) => durations.set(k, v)); } catch { /* leave runtimes empty */ }
    }

    // Sort each upload into: a track, a mix (DJ set / podcast / radio show), or skip.
    type MixRow = { title: string; dj_name: string | null; show_or_channel: string; uploaded_at: string | null; duration_seconds: number | null; artwork_url: string; source_url: string; platform: string; platform_id: string; embed_url: string; tracklist_status: string; status: string; genre: string };
    const rows: { title: string; artist_name: string; source_url: string; platform: string; platform_id: string; embed_url: string; artwork_url: string; released_on: string | null; status: string; source_name: string; genre: string; norm_key: string; duration_seconds: number | null }[] = [];
    const mixRows: MixRow[] = [];
    for (const e of entries) {
      const dur = durations.get(e.videoId) ?? null;
      if (e.isShort || looksLikeShort(e.title) || (dur != null && dur <= 60) || SKIP_WORDS.test(e.title)) { skipped++; continue; } // Shorts and non-music uploads
      if (isMixTitle(e.title) || (dur != null && dur >= 1500)) {
        if (src.genre === "bands") { skipped++; continue; } // Bands is tracks-only: full concerts and long videos are not mixes
        const title = cleanMixTitle(e.title);
        mixRows.push({
          title, dj_name: guessDj(title), show_or_channel: src.name, uploaded_at: e.publishedAt, duration_seconds: dur,
          artwork_url: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`, source_url: ytUrl(e.videoId), platform: "youtube", platform_id: e.videoId,
          embed_url: `https://www.youtube.com/embed/${e.videoId}`, tracklist_status: "none", status: "published", genre: src.genre ?? "dnb",
        });
        continue;
      }
      const p = parseTrack(e.title, false, src.is_artist ? src.name : undefined);
      if (!p) { skipped++; continue; }
      rows.push({
        title: p.title,
        artist_name: p.artist,
        source_url: ytUrl(e.videoId),
        platform: "youtube",
        platform_id: e.videoId,
        embed_url: `https://www.youtube.com/embed/${e.videoId}`,
        artwork_url: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
        released_on: e.publishedAt ? e.publishedAt.slice(0, 10) : null,
        status: p.suspicious ? "pending" : "published", // pending = held for review, hidden from the site
        source_name: src.name,
        genre: src.genre ?? "dnb",
        norm_key: normKey(p.artist, p.title),
        duration_seconds: dur,
      });
    }

    // Mixes: save new ones, then read a tracklist straight from the description when it has one (no extra requests needed).
    if (mixRows.length) {
      const { data: newMixes, error: mixErr } = await sb.from("mixes").upsert(mixRows, { onConflict: "source_url", ignoreDuplicates: true }).select("id,platform_id");
      if (mixErr) throw new Error(`mixes: ${mixErr.message}`);
      mixesAdded = newMixes?.length ?? 0;
      for (const m of newMixes ?? []) {
        const desc = entries.find((e) => e.videoId === m.platform_id)?.description ?? "";
        const list = parseTracklist(desc);
        if (list.length) { try { await saveTracklist(sb, m.id as string, list, ytUrl(m.platform_id as string), "description"); tracklistsFound++; } catch { /* the nightly tracklist job retries */ } }
      }
    }

    // Dedupe 1: same artist|title already in the database (e.g. uploaded by two channels).
    const keyOf = (r: { norm_key: string }) => r.norm_key;
    const seen = new Set<string>();
    let fresh = rows.filter((r) => (seen.has(keyOf(r)) ? false : (seen.add(keyOf(r)), true)));
    if (fresh.length) {
      const { data: existing } = await sb.from("tracks").select("norm_key").in("norm_key", fresh.map(keyOf));
      const have = new Set((existing ?? []).map((r) => r.norm_key as string));
      fresh = fresh.filter((r) => !have.has(keyOf(r)));
    }

    // Dedupe 2: same source_url is ignored by the upsert.
    if (fresh.length) {
      const { data, error } = await sb.from("tracks").upsert(fresh, { onConflict: "source_url", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    }

    await sb.from("scan_history").insert({ source_id: src.id, started_at: startedAt, finished_at: new Date().toISOString(), ok: true, items_found: found, items_new: added });
    await sb.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", src.id);
    return { source: src.name, ok: true, channel: feed.title, channel_id: channelId, found, added, mixes_added: mixesAdded, tracklists_from_description: tracklistsFound, skipped, ...(found === 0 ? { note: "feed has no uploads: open youtube.com/channel/" + channelId + " to check this is the right channel" } : {}) };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sb.from("scan_history").insert({ source_id: src.id, started_at: startedAt, finished_at: new Date().toISOString(), ok: false, items_found: found, items_new: added, error });
    return { source: src.name, ok: false, error };
  }
}

