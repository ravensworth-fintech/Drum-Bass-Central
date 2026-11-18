// YouTube channels publish a free public Atom feed (newest ~15 uploads). No API key or quota needed.
export type FeedEntry = { videoId: string; title: string; publishedAt: string | null };
export type ParsedTrack = { artist: string; title: string };

const UA = "Mozilla/5.0 (compatible; dnb-discover/1.0)";

function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en", Cookie: "CONSENT=YES+1" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Accepts a channel ID (UC...), a /channel/UC... URL, or an @handle / custom URL. */
export async function resolveChannelId(input: string): Promise<string> {
  const direct = input.match(/UC[\w-]{22}/);
  if (direct) return direct[0];
  const html = await fetchText(input);
  const m =
    html.match(/"channelId":"(UC[\w-]{22})"/) ||
    html.match(/"externalId":"(UC[\w-]{22})"/) ||
    html.match(/channel_id=(UC[\w-]{22})/);
  if (!m) throw new Error(`Could not find a channel ID at ${input}. Paste the /channel/UC... URL instead.`);
  return m[1];
}

export async function fetchChannelFeed(channelId: string): Promise<FeedEntry[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const out: FeedEntry[] = [];
  for (const e of entries) {
    const videoId = e.match(/<yt:videoId>([^<]+)</)?.[1];
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (!videoId || !title) continue;
    out.push({ videoId, title: decode(title).trim(), publishedAt: e.match(/<published>([^<]+)</)?.[1] ?? null });
  }
  return out;
}

// Titles that are clearly not single tracks.
const NOT_A_TRACK =
  /(?<!original |extended |club |vip |radio |dub |instrumental )\bmix\b|\bpodcast\b|\blive set\b|\blive at\b|\bepisode\b|\binterview\b|\btrailer\b|\bdocumentary\b|\bcompilation\b|\bmegamix\b|\bfull album\b|\bfestival\b|\baftermovie\b|\brecap\b|\bvlog\b|\btutorial\b|\bbehind the scenes\b|\bplaylist\b/i;
const NOISE = /\b(official|video|audio|visuali[sz]er|lyric|lyrics|out now|premiere|free download|clip|hq|hd)\b/i;

/** "Artist - Title (Official Video)" -> { artist, title }. Returns null when unsure, so nothing wrong gets published. */
export function parseTrack(raw: string): ParsedTrack | null {
  if (NOT_A_TRACK.test(raw)) return null;
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[(\[]([^)\]]*)[)\]]/g, (m, inner: string) => (NOISE.test(inner) ? "" : m)).trim();
  t = t.replace(/\s*(\||\/\/)\s*[^|]*$/, "").trim(); // trailing "| Label"
  t = t.replace(/\s*\[[^\]]*\]\s*$/, "").trim(); // trailing "[LABEL]" tag
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!m) return null;
  const artist = m[1].trim(), title = m[2].trim();
  if (!artist || !title || artist.length > 120 || title.length > 160) return null;
  return { artist, title };
}
