// Finds a mix's tracklist: (1) the YouTube description, (2) the top YouTube comments, (3) a best-effort lookup on 1001Tracklists.
import { decode } from "./youtube-feed";

export type TLEntry = { position: number; artist: string; title: string; label: string | null; seconds: number | null };
type Raw = Omit<TLEntry, "position">;

const TS = /^[\s\W]*?(?:\[|\()?\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(?:\]|\))?[\s\-–—.|:]*/;
const CHATTER = /\b(?:subscribe|follow|instagram|facebook|spotify|soundcloud|tracklist|download|stream|available|booking)\b/i;

const toSeconds = (ts: string) => ts.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);

/** One line like "12:34 Artist - Title [Label]", "3. Artist – Title" or "Artist - Title". */
function parseLine(line: string): Raw | null {
  let s = line.trim();
  if (!s || s.length > 240) return null;
  if (/https?:\/\/|www\./i.test(s) || /@\w/.test(s)) return null; // links and social handles
  let seconds: number | null = null;
  const ts = s.match(TS);
  if (ts) { seconds = toSeconds(ts[1]); s = s.slice(ts[0].length); }
  else s = s.replace(/^[\s\W]*?\d{1,3}\s*[.)\]:\-–]\s+/, ""); // "12. " numbering
  s = s.replace(/^[\s\-–—|:]+/, "").trim();
  let label: string | null = null;
  const lb = s.match(/\s*\[([^\]]{2,50})\]\s*$/);
  if (lb && lb.index !== undefined) { label = lb[1].trim(); s = s.slice(0, lb.index).trim(); }
  const m = s.match(/^(.{1,120}?)\s+[-–—]\s+(.{1,160})$/);
  if (!m) return null;
  const artist = m[1].trim(), title = m[2].trim();
  if (!/[a-z0-9]/i.test(artist) || !/[a-z0-9]/i.test(title)) return null;
  if (CHATTER.test(s)) return null;
  return { artist, title, label, seconds };
}

/** Pulls the longest run of "Artist - Title" lines out of free text. Needs at least 4 to count as a tracklist. */
export function parseTracklist(text: string): TLEntry[] {
  let best: Raw[] = [], cur: Raw[] = [], gap = 0;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const e = parseLine(line);
    if (e) { cur.push(e); gap = 0; }
    else if (line.trim() !== "" && ++gap > 1) { if (cur.length > best.length) best = cur; cur = []; gap = 0; }
  }
  if (cur.length > best.length) best = cur;
  return best.length >= 4 ? best.map((e, i) => ({ position: i + 1, ...e })) : [];
}

/** Top comments of a video via the official YouTube Data API (1 quota unit). Empty when comments are off or there is no key. */
export async function fetchCommentTexts(videoId: string, apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&order=relevance&textFormat=plainText&key=${apiKey}`,
      { signal: AbortSignal.timeout(7000), cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return ((json.items ?? []) as { snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }[])
      .map((it) => it.snippet?.topLevelComment?.snippet?.textDisplay ?? "")
      .filter(Boolean);
  } catch { return []; }
}

export function bestFromComments(texts: string[]): TLEntry[] {
  let best: TLEntry[] = [];
  for (const t of texts) { const l = parseTracklist(t); if (l.length > best.length) best = l; }
  return best;
}

// ---- 1001Tracklists (best effort, untested against the live site) -------------------------------------------------
// The site may block server requests or change its pages. Any failure simply returns null and the mix shows a manual search link.
const STOP = new Set(["mix", "drum", "bass", "dnb", "and", "the", "podcast", "live", "set", "radio", "show", "episode", "vol", "volume", "official", "hour", "hours", "with", "feat", "presents", "session", "sessions", "full", "new", "best"]);
const tokens = (s: string) =>
  Array.from(new Set(s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t))));

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; dnb-discover/1.0)", "Accept-Language": "en" }, signal: AbortSignal.timeout(7000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function find1001(query: string): Promise<{ url: string; entries: TLEntry[] } | null> {
  try {
    const html = await getHtml(`https://www.1001tracklists.com/search/result.php?main_search=${encodeURIComponent(query.slice(0, 80))}&search_selection=9`);
    const paths: string[] = [];
    const linkRe = /href="(\/tracklist\/[a-z0-9]+\/[^"#?]+\.html)"/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) && paths.length < 5) if (!paths.includes(m[1])) paths.push(m[1]);

    const qt = tokens(query);
    let best: { path: string; score: number } | null = null;
    for (const p of paths) {
      const st = tokens((p.split("/").pop() ?? "").replace(/\.html$/, ""));
      const overlap = qt.filter((t) => st.includes(t)).length;
      const score = qt.length ? overlap / qt.length : 0;
      if (overlap >= 2 && score >= 0.6 && (!best || score > best.score)) best = { path: p, score }; // strict: a wrong tracklist is worse than none
    }
    if (!best) return null;

    const url = `https://www.1001tracklists.com${best.path}`;
    const page = await getHtml(url);
    const entries: TLEntry[] = [];
    for (const chunk of page.split('class="tlpItem').slice(1)) {
      const name = chunk.match(/itemprop="name"\s+content="([^"]+)"/)?.[1] ?? chunk.match(/content="([^"]+)"\s+itemprop="name"/)?.[1];
      const pair = name ? decode(name).match(/^(.+?)\s+-\s+(.+)$/) : null;
      if (pair) entries.push({ position: entries.length + 1, artist: pair[1].trim(), title: pair[2].trim(), label: null, seconds: null });
    }
    return entries.length >= 4 ? { url, entries } : null;
  } catch { return null; }
}
