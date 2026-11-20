import { VERSION_WORDS } from "./mixes";
// YouTube channels publish a free public Atom feed (newest ~15 uploads). No API key or quota needed.
export type FeedEntry = { videoId: string; title: string; publishedAt: string | null; isShort: boolean; description: string };
export type ParsedTrack = { artist: string; title: string; suspicious: boolean };

const UA = "Mozilla/5.0 (compatible; dnb-discover/1.0)";

export function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function fetchText(url: string): Promise<string> {
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

const NAME_STOP = new Set(["official", "music", "records", "record", "recordings", "recording", "channel", "vevo", "topic", "the", "drum", "and", "bass", "dnb"]);
const nameKey = (s: string) => {
  const toks = s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
  const kept = toks.filter((t) => !NAME_STOP.has(t)).join("");
  return kept || toks.join("");
};
/** True when a YouTube channel's name plausibly is the source we meant (guards against a wrong @handle). */
export function namesMatch(sourceName: string, channelTitle: string): boolean {
  const full = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const a = nameKey(sourceName), b = nameKey(channelTitle);
  return (!!a && a === b) || (!!full(sourceName) && full(sourceName) === full(channelTitle)); // exact match only: "Dimension" must not match "Dimension Cinema"
}

/** Looks a channel up by name via YouTube's own search page. Only accepts a result whose name matches. */
export async function resolveByName(name: string, genre: "dnb" | "house" | "dubstep" | "bands" = "dnb"): Promise<string> {
  const html = await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} ${genre === "house" ? "house music" : genre === "dubstep" ? "dubstep" : genre === "bands" ? "band music" : "drum and bass"}`)}&sp=EgIQAg%253D%253D`);
  const re = /"channelRenderer":\{"channelId":"(UC[\w-]{22})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const title = html.slice(m.index, m.index + 900).match(/"title":\{"simpleText":"([^"]+)"/)?.[1];
    // YouTube writes "&" as \u0026 inside this JSON, so "Chase & Status" would never match without unescaping.
    const clean = title ? decode(title.replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\"/g, '"')) : "";
    if (clean && namesMatch(name, clean)) return m[1];
  }
  throw new Error(`No YouTube channel named "${name}" found by search. Paste its /channel/UC... URL into the source's url in Supabase.`);
}

export async function fetchChannelFeed(channelId: string): Promise<{ title: string; entries: FeedEntry[] }> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const title = decode(xml.split("<entry>")[0].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const out: FeedEntry[] = [];
  for (const e of entries) {
    const videoId = e.match(/<yt:videoId>([^<]+)</)?.[1];
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (!videoId || !title) continue;
    const href = e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ?? "";
    out.push({ videoId, title: decode(title).trim(), publishedAt: e.match(/<published>([^<]+)</)?.[1] ?? null, isShort: href.includes("/shorts/"), description: decode(e.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? "") });
  }
  return { title, entries: out };
}

// Titles that are clearly not single tracks.
const NOT_A_TRACK = new RegExp(
  `(?<!${VERSION_WORDS})\\bmix\\b|\\bpodcast\\b|\\blive set\\b|\\blive at\\b|\\blive from\\b|\\bepisode\\b|\\binterview\\b|\\btrailer\\b|\\bdocumentary\\b|\\bcompilation\\b|\\bmegamix\\b|\\bfull album\\b|\\bfestival\\b|\\baftermovie\\b|\\brecap\\b|\\bvlog\\b|\\btutorial\\b|\\bbehind the scenes\\b|\\bplaylist\\b|\\bboiler room\\b`, "i");
const NOISE = /\b(official|video|audio|visuali[sz]er|lyric|lyrics|out now|premiere|free download|clip|hq|hd)\b/i;

const HASHTAGS = /\s*#[^\s#]+/g;
const EMOJI = /[\u2190-\u2BFF\u{1F000}-\u{1FAFF}\uFE0F\u200D]/gu;
const PROMO = /\s*(?:[-–—|]\s*)?(?:\bis\s+)?\b(?:out now|available now|pre-?save|new music|still on repeat)\b[!.]*/gi;
// Artist fields that look like an event, series or caption rather than a person: held for review, not published.
const SUSPICIOUS_ARTIST = /@|\bid:|\byears of\b|\b(?:vol\.?|volume|episode|session|sessions|takeover|presents|festival|tour|live)\b/i;

/** "Artist - Title (Official Video) #dnb" -> { artist, title }. Returns null when unsure; suspicious=true means "send to review". */
/** Shorts captions are stuffed with hashtags ("... #dnb #newmusic #drumandbass"). Real uploads rarely have two or more in the title. */
export const looksLikeShort = (raw: string) => /#shorts?\b/i.test(raw) || (raw.match(/#[^\s#]+/g) ?? []).length >= 2;

export function parseTrack(raw: string, keepShorts = false, fallbackArtist?: string): ParsedTrack | null {
  if (NOT_A_TRACK.test(raw)) return null;
  if (!keepShorts && looksLikeShort(raw)) return null;
  let t = raw.replace(EMOJI, " ").replace(HASHTAGS, "").replace(PROMO, "").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[(\[]([^)\]]*)[)\]]/g, (m, inner: string) => (NOISE.test(inner) ? "" : m)).trim();
  t = t.replace(/\s*(\||\/\/)\s*[^|]*$/, "").trim(); // trailing "| Label"
  t = t.replace(/\s*\[[^\]]*\]\s*$/, "").trim(); // trailing "[LABEL]" tag
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!m) {
    // An artist's own channel usually titles uploads with just the track name: use the channel's artist name.
    if (fallbackArtist && t.length > 0 && t.length <= 160 && /[a-z0-9\u00C0-\uFFFF]/i.test(t)) return { artist: fallbackArtist, title: t, suspicious: /\|/.test(t) };
    return null;
  }
  const artist = m[1].trim(), title = m[2].trim();
  if (!artist || !title || artist.length > 120 || title.length > 160) return null;
  const suspicious = SUSPICIOUS_ARTIST.test(artist) || /\|/.test(artist + title) || !/[a-z0-9\u00C0-\uFFFF]/i.test(title);
  return { artist, title, suspicious };
}

const fold = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u00C0-\uFFFF]+/g, "");

/** Duplicate key that ignores case, punctuation, artist order, "&" vs "," and "(ft. X)" tails. */
export function normKey(artist: string, title: string): string {
  const names = artist.split(/\b(?:feat\.?|ft\.?|featuring)\b/i)[0].split(/\s*(?:,|&|\+|\bx\b|\band\b|\bvs\.?)\s*/i).map(fold).filter(Boolean);
  const t = fold(title.replace(/\s*[(\[]\s*(?:feat|ft|featuring)\b[^)\]]*[)\]]/gi, ""));
  return `${Array.from(new Set(names)).sort().join(",")}|${t}`;
}

/** Video lengths in seconds from the official YouTube Data API (videos.list, 1 quota unit per 50 videos). */
export async function fetchDurations(ids: string[], apiKey: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(",")}&key=${apiKey}`, {
      signal: AbortSignal.timeout(12000), cache: "no-store",
    });
    if (!res.ok) throw new Error(`YouTube Data API returned HTTP ${res.status}. Check YOUTUBE_API_KEY and that the YouTube Data API v3 is enabled.`);
    const json = await res.json();
    for (const it of json.items ?? []) {
      const m = String(it.contentDetails?.duration ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
      if (m) out.set(it.id as string, Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
    }
  }
  return out;
}
