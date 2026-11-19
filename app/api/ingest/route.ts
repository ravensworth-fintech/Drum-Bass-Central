import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, fetchDurations, looksLikeShort, namesMatch, normKey, parseTrack, resolveByName, resolveChannelId } from "@/lib/youtube-feed";
import { cleanMixTitle, guessDj, isMixTitle, SKIP_WORDS } from "@/lib/mixes";
import { bestFromComments, fetchCommentTexts, find1001, parseTracklist, TLEntry } from "@/lib/tracklist";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Source = { id: string; name: string; url: string; platform_id: string | null };
type SB = ReturnType<typeof admin>;
const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

async function saveTracklist(sb: SB, mixId: string, list: TLEntry[], sourceUrl: string, origin: "description" | "comments" | "1001tracklists") {
  await sb.from("tracklist_entries").delete().eq("mix_id", mixId);
  const { error } = await sb.from("tracklist_entries").insert(list.map((e) => ({
    mix_id: mixId, position: e.position, artist_name: e.artist, title: e.title, label_name: e.label, timestamp_seconds: e.seconds, tracklist_source_url: sourceUrl,
  })));
  if (error) throw new Error(error.message);
  await sb.from("mixes").update({ tracklist_status: "matched", tracklist_origin: origin, tracklist_checked_at: new Date().toISOString() }).eq("id", mixId);
}

async function scanSource(sb: ReturnType<typeof admin>, src: Source) {
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
        try { channelId = await resolveByName(src.name); }
        catch (e) {
          throw new Error(seen
            ? `The channel at ${src.url} is called "${seen}", which doesn't match "${src.name}", and a search found nothing better. If "${seen}" is right, rename this source to match in Supabase; otherwise set the correct url.`
            : (e instanceof Error ? e.message : String(e)));
        }
      }
      await sb.from("sources").update({ platform_id: channelId }).eq("id", src.id);
    }
    if (!feed) feed = await fetchChannelFeed(channelId);
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
    type MixRow = { title: string; dj_name: string | null; show_or_channel: string; uploaded_at: string | null; duration_seconds: number | null; artwork_url: string; source_url: string; platform: string; platform_id: string; embed_url: string; tracklist_status: string; status: string };
    const rows: { title: string; artist_name: string; source_url: string; platform: string; platform_id: string; embed_url: string; artwork_url: string; released_on: string | null; status: string; source_name: string; norm_key: string; duration_seconds: number | null }[] = [];
    const mixRows: MixRow[] = [];
    for (const e of entries) {
      const dur = durations.get(e.videoId) ?? null;
      if (e.isShort || looksLikeShort(e.title) || (dur != null && dur <= 60) || SKIP_WORDS.test(e.title)) { skipped++; continue; } // Shorts and non-music uploads
      if (isMixTitle(e.title) || (dur != null && dur >= 1500)) {
        const title = cleanMixTitle(e.title);
        mixRows.push({
          title, dj_name: guessDj(title), show_or_channel: src.name, uploaded_at: e.publishedAt, duration_seconds: dur,
          artwork_url: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`, source_url: ytUrl(e.videoId), platform: "youtube", platform_id: e.videoId,
          embed_url: `https://www.youtube.com/embed/${e.videoId}`, tracklist_status: "none", status: "published",
        });
        continue;
      }
      const p = parseTrack(e.title);
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
    return { source: src.name, ok: true, found, added, mixes_added: mixesAdded, tracklists_from_description: tracklistsFound, skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sb.from("scan_history").insert({ source_id: src.id, started_at: startedAt, finished_at: new Date().toISOString(), ok: false, items_found: found, items_new: added, error });
    return { source: src.name, ok: false, error };
  }
}

/** One-off tidy of tracks already in the database: strip hashtags/promo, merge duplicates, hold odd artists for review. */
async function cleanup(sb: ReturnType<typeof admin>) {
  const { data, error } = await sb.from("tracks").select("id,title,artist_name,status,created_at").order("created_at", { ascending: true }).limit(5000);
  if (error) throw new Error(error.message);
  type R = { id: string; status: string; key: string; short: boolean; next: { artist: string; title: string; suspicious: boolean } };
  const rows: R[] = (data ?? []).map((r) => {
    const raw = `${r.artist_name} - ${r.title}`;
    const next = parseTrack(raw, true) ?? { artist: r.artist_name as string, title: r.title as string, suspicious: false };
    return { id: r.id as string, status: r.status as string, next, short: looksLikeShort(raw), key: normKey(next.artist, next.title) };
  });
  const groups = new Map<string, R[]>();
  rows.forEach((r) => groups.set(r.key, [...(groups.get(r.key) ?? []), r]));
  let kept = 0, hidden = 0, review = 0, likesMoved = 0;
  for (const [key, g] of Array.from(groups)) {
    g.sort((a, b) => Number(b.status === "published") - Number(a.status === "published") || Number(a.short) - Number(b.short)); // stable: oldest first among equals
    const [keep, ...dups] = g;
    if (dups.length) {
      const ids = dups.map((d) => d.id);
      const { data: likes } = await sb.from("liked_tracks").select("user_id,liked_at").in("track_id", ids);
      if (likes?.length) {
        await sb.from("liked_tracks").upsert(likes.map((l) => ({ user_id: l.user_id, track_id: keep.id, liked_at: l.liked_at })), { onConflict: "user_id,track_id", ignoreDuplicates: true });
        likesMoved += likes.length;
      }
      await sb.from("liked_tracks").delete().in("track_id", ids);
      await sb.from("tracks").update({ status: "rejected", norm_key: key }).in("id", ids);
      hidden += ids.length;
    }
    const status = keep.short ? "rejected" : keep.status === "published" && keep.next.suspicious ? "pending" : keep.status;
    if (status !== keep.status) review++;
    await sb.from("tracks").update({ title: keep.next.title, artist_name: keep.next.artist, norm_key: key, status }).eq("id", keep.id);
    kept++;
  }
  return { checked: rows.length, kept, duplicates_hidden: hidden, sent_to_review: review, likes_moved: likesMoved };
}

/** Fill in runtimes for tracks that don't have one yet (300 per run; run again for more). */
async function backfillDurations(sb: ReturnType<typeof admin>) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set in the environment");
  const { data, error } = await sb.from("tracks").select("id,platform_id").eq("platform", "youtube").is("duration_seconds", null).limit(300);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const d = await fetchDurations(rows.map((r) => r.platform_id as string), key);
  let updated = 0;
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (r) => {
      const sec = d.get(r.platform_id as string);
      if (sec != null) { await sb.from("tracks").update(sec <= 60 ? { duration_seconds: sec, status: "rejected" } : { duration_seconds: sec }).eq("id", r.id); updated++; }
    }));
  }
  return { checked: rows.length, updated, note: rows.length === 300 ? "run again for more" : "done" };
}

/** Finds tracklists for mixes that don't have one yet: YouTube comments first, then a best-effort 1001Tracklists lookup. */
async function tracklistJob(sb: SB) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data, error } = await sb.from("mixes").select("id,title,dj_name,show_or_channel,platform_id")
    .eq("tracklist_status", "none").or(`tracklist_checked_at.is.null,tracklist_checked_at.lt.${threeDaysAgo}`)
    .order("tracklist_checked_at", { ascending: true, nullsFirst: true }).order("uploaded_at", { ascending: false }).limit(6);
  if (error) throw new Error(error.message);
  const mixes = data ?? [];
  let found = 0;
  const notes: string[] = [];
  for (let i = 0; i < mixes.length; i += 3) { // small batches keep us under the time limit and gentle on 1001Tracklists
    await Promise.all(mixes.slice(i, i + 3).map(async (m) => {
      const id = m.id as string, vid = m.platform_id as string;
      try {
        let list: TLEntry[] = [], url = ytUrl(vid), origin: "comments" | "1001tracklists" = "comments";
        if (apiKey) list = bestFromComments(await fetchCommentTexts(vid, apiKey));
        if (!list.length) {
          const query = [m.dj_name ?? m.show_or_channel, String(m.title).replace(/\b(?:mix|podcast|episode|live)\b/gi, "")].filter(Boolean).join(" ");
          const hit = await find1001(query);
          if (hit) { list = hit.entries; url = hit.url; origin = "1001tracklists"; }
        }
        if (list.length) { await saveTracklist(sb, id, list, url, origin); found++; }
        else await sb.from("mixes").update({ tracklist_checked_at: new Date().toISOString() }).eq("id", id);
      } catch (e) {
        notes.push(`${m.title}: ${e instanceof Error ? e.message : String(e)}`);
        await sb.from("mixes").update({ tracklist_checked_at: new Date().toISOString() }).eq("id", id);
      }
    }));
  }
  const { count } = await sb.from("mixes").select("id", { count: "exact", head: true }).eq("tracklist_status", "none").is("tracklist_checked_at", null);
  return { checked: mixes.length, found, still_unchecked: count ?? 0, comments_used: !!apiKey, notes };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set in the environment" }, { status: 500 });
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? new URL(req.url).searchParams.get("secret");
  if (given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = admin();
  const params = new URL(req.url).searchParams;
  const add = params.get("add");
  if (add) { // /api/ingest?secret=...&add=https://www.youtube.com/@Handle&name=Label Name
    if (!/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(add)) return NextResponse.json({ error: "add must be a youtube.com channel URL" }, { status: 400 });
    const name = params.get("name") || decodeURIComponent(add.split("/").filter(Boolean).pop() ?? "YouTube channel");
    const { error } = await sb.from("sources").upsert({ name, kind: "youtube", url: add, monitorable: "auto" }, { onConflict: "url", ignoreDuplicates: true });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ added: { name, url: add }, next: "open /api/ingest to scan it" });
  }
  if (params.get("sources")) { // quick health check: which channels are connected and which still need attention
    const { data, error } = await sb.from("sources").select("name,url,platform_id,last_success_at,enabled").eq("kind", "youtube").order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const all = data ?? [];
    return NextResponse.json({
      total: all.length,
      working: all.filter((x) => x.last_success_at).length,
      never_worked: all.filter((x) => !x.last_success_at).map((x) => `${x.name} (${x.url})`),
    });
  }
  if (params.get("tracklists")) {
    try { return NextResponse.json({ tracklists: await tracklistJob(sb) }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }
  if (new URL(req.url).searchParams.get("durations")) {
    try { return NextResponse.json({ durations: await backfillDurations(sb) }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }
  if (new URL(req.url).searchParams.get("cleanup")) {
    try { return NextResponse.json({ cleanup: await cleanup(sb) }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }
  // Least-recently-scanned first, in small batches, within a time budget. If the list is long, a second run picks up the rest.
  const { data: sources, error } = await sb.from("sources").select("id,name,url,platform_id").eq("kind", "youtube").eq("enabled", true)
    .order("last_success_at", { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const started = Date.now();
  const list = (sources ?? []) as Source[];
  const results: unknown[] = [];
  let i = 0;
  for (; i < list.length && Date.now() - started < 40_000; i += 8) {
    results.push(...(await Promise.all(list.slice(i, i + 8).map((s) => scanSource(sb, s)))));
  }
  const notReached = list.slice(i).map((s) => s.name);
  return NextResponse.json({
    ran_at: new Date().toISOString(), sources: list.length, scanned: results.length,
    ...(notReached.length ? { not_reached_run_again: notReached } : {}), results,
  });
}
