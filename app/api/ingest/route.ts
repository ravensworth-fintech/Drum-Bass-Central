import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, parseTrack, resolveChannelId } from "@/lib/youtube-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Source = { id: string; name: string; url: string; platform_id: string | null };

async function scanSource(sb: ReturnType<typeof admin>, src: Source) {
  const startedAt = new Date().toISOString();
  let found = 0, added = 0, skipped = 0;
  try {
    let channelId = src.platform_id;
    if (!channelId) {
      channelId = await resolveChannelId(src.url);
      await sb.from("sources").update({ platform_id: channelId }).eq("id", src.id);
    }
    const entries = await fetchChannelFeed(channelId);
    found = entries.length;

    // Backfill: tag tracks added before source_name existed.
    if (entries.length) {
      await sb.from("tracks").update({ source_name: src.name }).eq("platform", "youtube").in("platform_id", entries.map((e) => e.videoId)).is("source_name", null);
    }

    const rows = entries.flatMap((e) => {
      const p = parseTrack(e.title);
      if (!p) { skipped++; return []; }
      return [{
        title: p.title,
        artist_name: p.artist,
        source_url: `https://www.youtube.com/watch?v=${e.videoId}`,
        platform: "youtube",
        platform_id: e.videoId,
        embed_url: `https://www.youtube.com/embed/${e.videoId}`,
        artwork_url: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
        released_on: e.publishedAt ? e.publishedAt.slice(0, 10) : null,
        status: "published",
        source_name: src.name,
      }];
    });

    // Dedupe 1: same artist|title already in the database (e.g. uploaded by two channels).
    const keyOf = (r: { artist_name: string; title: string }) => `${r.artist_name.toLowerCase()}|${r.title.toLowerCase()}`;
    const seen = new Set<string>();
    let fresh = rows.filter((r) => (seen.has(keyOf(r)) ? false : (seen.add(keyOf(r)), true)));
    if (fresh.length) {
      const { data: existing } = await sb.from("tracks").select("dedupe_key").in("dedupe_key", fresh.map(keyOf));
      const have = new Set((existing ?? []).map((r) => r.dedupe_key as string));
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
    return { source: src.name, ok: true, found, added, skipped_not_tracks: skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sb.from("scan_history").insert({ source_id: src.id, started_at: startedAt, finished_at: new Date().toISOString(), ok: false, items_found: found, items_new: added, error });
    return { source: src.name, ok: false, error };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set in the environment" }, { status: 500 });
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? new URL(req.url).searchParams.get("secret");
  if (given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = admin();
  const { data: sources, error } = await sb.from("sources").select("id,name,url,platform_id").eq("kind", "youtube").eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One failing source never stops the others.
  const results = await Promise.all((sources ?? []).map((s) => scanSource(sb, s as Source)));
  return NextResponse.json({ ran_at: new Date().toISOString(), sources: results.length, results });
}
