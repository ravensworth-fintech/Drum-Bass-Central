import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase-admin";
import { fetchChannelFeed, resolveChannelId } from "@/lib/youtube-feed";
import { Source } from "@/lib/scan-source";
import { scanAny } from "@/lib/run-ingest";
import { fetchScFeed, resolveScUser } from "@/lib/soundcloud-feed";
import { GenreKey, parseGenre } from "@/lib/genres";
import { requireUser } from "@/lib/require-user";
import { addAllowance, follow, limitMessage, logAdd } from "@/lib/follow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
type SB = ReturnType<typeof admin>;
type Who = { sb: SB; userId: string; isAdmin: boolean };
type Row = Source & { enabled?: boolean; last_success_at?: string | null };
const COLS = "id,name,url,kind,platform_id,is_artist,genre,enabled,last_success_at";
const STALE_MS = 2 * 60 * 60 * 1000; // a channel the site scanned in the last 2 hours is not scanned again just because someone follows it

/**
 * Powers the ADD + button. Body: { url, genre: "dnb" | "house" | "dubstep" | "bands", isArtist?: boolean }.
 * Any signed-in account may call it. The channel is added to the shared `sources` pool if it is new, scanned if it is new or stale,
 * and put on the caller's own list. Admins can add without limit (and what they add joins the starter set);
 * everyone else may add 15 per rolling 24 hours, and their additions stay out of the starter set.
 */
export async function POST(req: Request) {
  const u = await requireUser(req);
  if (!u.ok) return fail(u.error, u.status);
  const who: Who = { sb: u.sb, userId: u.userId, isAdmin: u.isAdmin };

  if (!who.isAdmin) {
    const a = await addAllowance(who.sb, who.userId);
    if (a.left <= 0) return fail(limitMessage(a.freesInMinutes), 429);
  }

  let body: { url?: string; genre?: string; isArtist?: boolean };
  try { body = await req.json(); } catch { return fail("Bad request."); }
  let url = String(body.url ?? "").trim();
  if (!url) return fail("Paste a YouTube channel link.");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const genre = parseGenre(body.genre);
  if (/^https?:\/\/((www|m|on|feeds)\.)?soundcloud\.com\//i.test(url)) return addSoundcloud(who, url, genre, body.isArtist !== false);
  if (!/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(url)) return fail("That isn't a YouTube or SoundCloud link. Examples: https://www.youtube.com/@ChannelName or https://soundcloud.com/artistname");

  try {
    const channelId = await resolveChannelId(url);
    const feed = await fetchChannelFeed(channelId);
    if (!feed.title) return fail("Couldn't read that channel. Check the link and try again.");

    const { data: existing } = await who.sb.from("sources").select(COLS).eq("platform_id", channelId).limit(1);
    return finish(who, existing?.[0] as Row | undefined, () => ({
      name: feed.title, kind: "youtube", url: `https://www.youtube.com/channel/${channelId}`, platform_id: channelId, genre, is_artist: !!body.isArtist,
    }), genre);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/** SoundCloud account (profile link or feeds.soundcloud.com RSS link): add it as a `soundcloud` source and scan its RSS feed. */
async function addSoundcloud(who: Who, url: string, genre: GenreKey, isArtist: boolean) {
  try {
    const userId = await resolveScUser(url);
    const feed = await fetchScFeed(userId);
    if (!feed.items.length) return fail("That SoundCloud account has no public tracks in its RSS feed, or SoundCloud doesn't publish a feed for it.");
    const profile = url.match(/^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^/?#]+)/i)?.[1];
    const canonical = profile && profile !== "you" ? `https://soundcloud.com/${profile}` : `https://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss`;
    const name = feed.title || profile || `SoundCloud ${userId}`;
    const { data: existing } = await who.sb.from("sources").select(COLS).eq("kind", "soundcloud").eq("platform_id", userId).limit(1);
    return finish(who, existing?.[0] as Row | undefined, () => ({ name, kind: "soundcloud", url: canonical, platform_id: userId, genre, is_artist: isArtist }), genre);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/** Shared tail of both paths: create the source if it is new, follow it, count the add, scan if needed, answer. */
async function finish(who: Who, existing: Row | undefined, make: () => Record<string, unknown>, genre: GenreKey) {
  const { sb, userId, isAdmin } = who;
  let src: Row;
  const existed = !!existing;
  if (existing) {
    src = existing;
    if (isAdmin && existing.enabled === false) { await sb.from("sources").update({ enabled: true }).eq("id", existing.id); src = { ...existing, enabled: true }; }
  } else {
    // Admin additions join the starter set (what signed-out visitors see); other people's stay personal.
    const { data, error } = await sb.from("sources").insert({ ...make(), monitorable: "auto", enabled: true, is_starter: isAdmin }).select(COLS).single();
    if (error) return fail(error.message, 500);
    src = data as Row;
  }

  const f = await follow(sb, userId, src.id);
  if (f.error) return fail(f.error, 500);
  if (f.already && !isAdmin) {
    return NextResponse.json({ ok: true, existed, alreadyFollowing: true, name: src.name, genre: src.genre ?? genre, scan: {}, addsLeft: (await addAllowance(sb, userId)).left });
  }
  if (!isAdmin) await logAdd(sb, userId);

  const fresh = src.last_success_at && Date.now() - Date.parse(src.last_success_at) < STALE_MS;
  const result = existed && !isAdmin && fresh ? { ok: true, found: 0, added: 0, mixes_added: 0 } : await scanAny(sb, src);
  const addsLeft = isAdmin ? null : (await addAllowance(sb, userId)).left;
  return NextResponse.json({ ok: true, existed, alreadyFollowing: f.already, name: src.name, genre: src.genre ?? genre, scan: result, addsLeft });
}
