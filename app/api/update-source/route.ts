import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { fetchChannelFeed, resolveChannelId } from "@/lib/youtube-feed";
import { fetchScFeed, resolveScUser } from "@/lib/soundcloud-feed";
import { scanAny } from "@/lib/run-ingest";
import { Source } from "@/lib/scan-source";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

type Target = { kind: "youtube" | "soundcloud"; platform_id: string; url: string; title: string; latest: string[] };

/** Works out which YouTube channel / SoundCloud account a pasted link really points at, and what it has uploaded lately. */
async function resolveTarget(raw: string): Promise<Target> {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (/^https?:\/\/((www|m|on|feeds)\.)?soundcloud\.com\//i.test(url)) {
    const userId = await resolveScUser(url);
    const feed = await fetchScFeed(userId);
    if (!feed.items.length) throw new Error("That SoundCloud account has no public tracks in its RSS feed, or SoundCloud doesn't publish a feed for it.");
    const profile = url.match(/^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([^/?#]+)/i)?.[1];
    const canonical = profile && profile !== "you" ? `https://soundcloud.com/${profile}` : `https://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss`;
    return { kind: "soundcloud", platform_id: userId, url: canonical, title: feed.title || profile || `SoundCloud ${userId}`, latest: feed.items.slice(0, 3).map((i) => i.title) };
  }
  if (!/^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(url)) throw new Error("That isn't a YouTube or SoundCloud link. Examples: https://www.youtube.com/@ChannelName or https://soundcloud.com/artistname");
  const channelId = await resolveChannelId(url);
  const feed = await fetchChannelFeed(channelId);
  if (!feed.title) throw new Error("Couldn't read that channel. Check the link and try again.");
  return { kind: "youtube", platform_id: channelId, url: `https://www.youtube.com/channel/${channelId}`, title: feed.title, latest: feed.entries.slice(0, 3).map((e) => e.title) };
}

/**
 * Admin only. Re-points an existing channel at a different YouTube channel or SoundCloud account (a channel can switch between the two).
 * Body: { id, url, check?: true, hideOld?: boolean }.
 *  - check: true  -> only looks the link up and reports what it found; nothing is changed.
 *  - otherwise    -> saves the new link, keeps the channel's name (so tracks already filed under it stay with it), and scans it now.
 *  - hideOld      -> first hides (status "rejected", nothing deleted) the tracks and mixes already filed under the channel's name, for when they came from the wrong account.
 * Because channels are shared, this changes it for everyone who follows it.
 */
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return fail(a.error, a.status);
  let body: { id?: string; url?: string; check?: boolean; hideOld?: boolean };
  try { body = await req.json(); } catch { return fail("Bad request."); }
  if (!body.id || !body.url?.trim()) return fail("Paste the correct YouTube or SoundCloud link.");
  const sb = a.sb;

  const { data: src } = await sb.from("sources").select("id,name,url,kind,platform_id,is_artist,genre").eq("id", body.id).maybeSingle();
  if (!src) return fail("That channel is gone. Refresh the list.", 404);

  let target: Target;
  try { target = await resolveTarget(body.url); } catch (e) { return fail(e instanceof Error ? e.message : String(e), 400); }

  const { data: clash } = await sb.from("sources").select("id,name").eq("kind", target.kind).eq("platform_id", target.platform_id).neq("id", src.id).limit(1);
  if (clash?.length) return fail(`That account is already on the site as "${clash[0].name}". Follow that one instead, or remove one of the two.`, 409);

  const same = src.platform_id === target.platform_id && src.kind === target.kind;
  if (body.check) return NextResponse.json({ ok: true, found: { kind: target.kind, title: target.title, latest: target.latest, url: target.url }, same });
  if (same) return fail("That's the account this channel already uses.", 409);

  let hiddenTracks = 0, hiddenMixes = 0;
  if (body.hideOld) {
    const t = await sb.from("tracks").update({ status: "rejected" }).eq("source_name", src.name).neq("status", "rejected").select("id");
    if (t.error) return fail(t.error.message, 500);
    const m = await sb.from("mixes").update({ status: "rejected" }).eq("show_or_channel", src.name).neq("status", "rejected").select("id");
    if (m.error) return fail(m.error.message, 500);
    hiddenTracks = t.data?.length ?? 0; hiddenMixes = m.data?.length ?? 0;
  }

  const upd = await sb.from("sources").update({ url: target.url, kind: target.kind, platform_id: target.platform_id, last_success_at: null }).eq("id", src.id);
  if (upd.error) return fail(upd.error.message, 500);

  try {
    const scan = await scanAny(sb, { ...(src as Source), url: target.url, kind: target.kind, platform_id: target.platform_id });
    return NextResponse.json({ ok: true, name: src.name, title: target.title, kind: target.kind, url: target.url, scan, hiddenTracks, hiddenMixes });
  } catch (e) { // the link IS saved; only the first scan failed (the scheduled scan will retry)
    return NextResponse.json({ ok: true, name: src.name, title: target.title, kind: target.kind, url: target.url, scan: { ok: false, error: e instanceof Error ? e.message : String(e) }, hiddenTracks, hiddenMixes });
  }
}
