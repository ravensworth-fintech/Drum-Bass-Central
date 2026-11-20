import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, resolveChannelId } from "@/lib/youtube-feed";
import { Source } from "@/lib/scan-source";
import { scanAny } from "@/lib/run-ingest";
import { fetchScFeed, resolveScUser } from "@/lib/soundcloud-feed";
import { GenreKey, parseGenre } from "@/lib/genres";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Powers the ADD + button. Body: { url, genre: "dnb" | "house" | "dubstep" | "bands", isArtist?: boolean }.
 * Only a signed-in admin (profiles.is_admin = true) may call it; the browser sends its Supabase login token.
 * Adds the channel to `sources`, scans it straight away and returns what it found.
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Sign in first.", 401);
  const sb = admin();
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth.user) return fail("Your sign-in has expired. Sign in again.", 401);
  const { data: profile } = await sb.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!profile?.is_admin) return fail("This account is not an admin, so it can't add sources.", 403);

  let body: { url?: string; genre?: string; isArtist?: boolean };
  try { body = await req.json(); } catch { return fail("Bad request."); }
  let url = String(body.url ?? "").trim();
  if (!url) return fail("Paste a YouTube channel link.");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const genre = parseGenre(body.genre);
  if (/^https?:\/\/((www|m|on|feeds)\.)?soundcloud\.com\//i.test(url)) return addSoundcloud(sb, url, genre, body.isArtist !== false);
  if (!/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(url)) return fail("That isn't a YouTube or SoundCloud link. Examples: https://www.youtube.com/@ChannelName or https://soundcloud.com/artistname");

  try {
    const channelId = await resolveChannelId(url);
    const feed = await fetchChannelFeed(channelId);
    if (!feed.title) return fail("Couldn't read that channel. Check the link and try again.");

    // Already a source (maybe under another name, or switched off)? Reuse it instead of adding a duplicate.
    const { data: existing } = await sb.from("sources").select("id,name,url,platform_id,is_artist,genre").eq("platform_id", channelId).limit(1);
    let src: Source;
    let already = false;
    if (existing?.length) {
      already = true;
      src = existing[0] as Source;
      await sb.from("sources").update({ enabled: true }).eq("id", src.id);
    } else {
      const { data, error } = await sb.from("sources").insert({
        name: feed.title, kind: "youtube", url: `https://www.youtube.com/channel/${channelId}`, platform_id: channelId,
        monitorable: "auto", enabled: true, genre, is_artist: !!body.isArtist,
      }).select("id,name,url,platform_id,is_artist,genre").single();
      if (error) return fail(error.message, 500);
      src = data as Source;
    }

    const result = await scanAny(sb, src);
    return NextResponse.json({ ok: true, already, name: src.name, genre: src.genre ?? genre, scan: result });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/** SoundCloud account (profile link or feeds.soundcloud.com RSS link): add it as a `soundcloud` source and scan its RSS feed now. */
async function addSoundcloud(sb: ReturnType<typeof admin>, url: string, genre: GenreKey, isArtist: boolean) {
  try {
    const userId = await resolveScUser(url);
    const feed = await fetchScFeed(userId);
    if (!feed.items.length) return fail("That SoundCloud account has no public tracks in its RSS feed, or SoundCloud doesn't publish a feed for it.");
    const profile = url.match(/^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^/?#]+)/i)?.[1];
    const canonical = profile && profile !== "you" ? `https://soundcloud.com/${profile}` : `https://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss`;
    const name = feed.title || profile || `SoundCloud ${userId}`;

    const { data: existing } = await sb.from("sources").select("id,name,url,kind,platform_id,is_artist,genre").eq("kind", "soundcloud").eq("platform_id", userId).limit(1);
    let src: Source, already = false;
    if (existing?.length) {
      already = true;
      src = existing[0] as Source;
      await sb.from("sources").update({ enabled: true }).eq("id", src.id);
    } else {
      const { data, error } = await sb.from("sources").insert({ name, kind: "soundcloud", url: canonical, platform_id: userId, monitorable: "auto", enabled: true, genre, is_artist: isArtist })
        .select("id,name,url,kind,platform_id,is_artist,genre").single();
      if (error) return fail(error.message, 500);
      src = data as Source;
    }
    const result = await scanAny(sb, src);
    return NextResponse.json({ ok: true, already, name: src.name, genre: src.genre ?? genre, scan: result });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
