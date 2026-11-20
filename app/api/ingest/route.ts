import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, fetchDurations, looksLikeShort, normKey, parseTrack, resolveChannelId } from "@/lib/youtube-feed";
import { bestFromComments, fetchCommentTexts, find1001, TLEntry } from "@/lib/tracklist";
import { saveTracklist, ytUrl, SB } from "@/lib/scan-source";
import { runIngest } from "@/lib/run-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    .eq("platform", "youtube").eq("tracklist_status", "none").or(`tracklist_checked_at.is.null,tracklist_checked_at.lt.${threeDaysAgo}`)
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
  const { count } = await sb.from("mixes").select("id", { count: "exact", head: true }).eq("platform", "youtube").eq("tracklist_status", "none").is("tracklist_checked_at", null);
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
  if (add) { // /api/ingest?secret=...&name=Label Name&add=https://www.youtube.com/@Handle&genre=house  (adds a source, or repoints an existing one with that name; genre is dnb, house, dubstep or bands)
    if (!/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(add)) return NextResponse.json({ error: "add must be a youtube.com channel URL" }, { status: 400 });
    const name = params.get("name") || decodeURIComponent(add.split("/").filter(Boolean).pop() ?? "YouTube channel");
    try {
      const channelId = await resolveChannelId(add);
      const feed = await fetchChannelFeed(channelId); // shows you which channel you just connected
      const { data: existing } = await sb.from("sources").select("id").eq("name", name).limit(1);
      const genreParam = params.get("genre");
      const row = { url: add, platform_id: channelId, enabled: true, ...(genreParam === "house" || genreParam === "dnb" || genreParam === "dubstep" || genreParam === "bands" ? { genre: genreParam } : {}) };
      const { error } = existing?.length
        ? await sb.from("sources").update(row).eq("id", existing[0].id)
        : await sb.from("sources").insert({ name, kind: "youtube", monitorable: "auto", ...row });
      if (error) throw new Error(error.message);
      return NextResponse.json({ saved: name, connected_to_channel: feed.title, recent_uploads: feed.entries.length, next: "open /api/ingest to scan it" });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }
  if (params.get("sources")) { // health check: which channels work, and why the others don't
    const { data, error } = await sb.from("sources").select("id,name,url,kind,platform_id,last_success_at").in("kind", ["youtube", "soundcloud"]).order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: hist } = await sb.from("scan_history").select("source_id,ok,error,items_found,started_at").order("started_at", { ascending: false }).limit(2000);
    const latest = new Map<string, { ok: boolean; error: string | null; found: number }>();
    for (const h of hist ?? []) if (!latest.has(h.source_id as string)) latest.set(h.source_id as string, { ok: !!h.ok, error: (h.error as string | null) ?? null, found: Number(h.items_found ?? 0) });
    const all = data ?? [];
    const broken = all.filter((x) => !x.last_success_at);
    return NextResponse.json({
      total: all.length,
      working: all.length - all.filter((x) => latest.get(x.id as string)?.ok === false || !x.last_success_at).length,
      not_scanned_yet: broken.filter((x) => !latest.has(x.id as string)).map((x) => x.name),
      empty_feed_check_these: all.filter((x) => x.last_success_at && latest.get(x.id as string)?.ok && latest.get(x.id as string)?.found === 0).map((x) => `${x.name}: ${x.kind === "soundcloud" ? x.url : `https://www.youtube.com/channel/${x.platform_id}`}`),
      failed: all.filter((x) => latest.get(x.id as string)?.ok === false).map((x) => ({ name: x.name, url: x.url, error: latest.get(x.id as string)?.error ?? "unknown" })),
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
  try {
    const r = await runIngest(sb);
    return NextResponse.json({
      ran_at: new Date().toISOString(), sources: r.total, scanned: r.results.length,
      ...(r.notReached.length ? { not_reached_run_again: r.notReached } : {}), results: r.results,
    });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
