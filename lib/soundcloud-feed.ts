// SoundCloud gives every account a public RSS feed of its uploads: feeds.soundcloud.com/users/soundcloud:users:<ID>/sounds.rss
// No API key. We only need the account's numeric ID, which we read from the profile page (or from a pasted RSS link).
import { decode, fetchText } from "./youtube-feed";

export type ScItem = { id: string | null; title: string; link: string; publishedAt: string | null; seconds: number | null; image: string | null; description: string };

export const scFeedUrl = (userId: string) => `https://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss`;

const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(cdata(m[1]).trim()) : "";
};
const seconds = (s: string): number | null => {
  if (!s) return null;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((t, n) => t * 60 + n, 0);
};

/** Pure parser (no network): RSS text -> account title + uploads. */
export function parseScFeed(xml: string): { title: string; items: ScItem[] } {
  const firstItem = xml.indexOf("<item>");
  const title = tag(firstItem === -1 ? xml : xml.slice(0, firstItem), "title").replace(/\s*(?:[-|•]\s*)?(?:on\s+)?SoundCloud\s*$/i, "").trim();
  const items: ScItem[] = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const t = tag(block, "title");
    const link = (tag(block, "link") || tag(block, "guid")).split(/[?#]/)[0];
    if (!t || !/^https?:\/\/(www\.)?soundcloud\.com\//i.test(link)) continue;
    const pub = tag(block, "pubDate");
    const d = pub ? new Date(pub) : null;
    items.push({
      id: block.match(/tracks[\/:](\d+)/)?.[1] ?? null,
      title: t, link,
      publishedAt: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
      seconds: seconds(tag(block, "itunes:duration")),
      image: block.match(/<itunes:image[^>]*href="([^"]+)"/)?.[1] ?? null,
      description: tag(block, "description"),
    });
  }
  return { title, items };
}

export async function fetchScFeed(userId: string) {
  return parseScFeed(await fetchText(scFeedUrl(userId)));
}

/** Accepts a soundcloud.com profile link or a feeds.soundcloud.com RSS link. Returns the numeric account ID. */
export async function resolveScUser(input: string): Promise<string> {
  const direct = input.match(/soundcloud:users:(\d+)/);
  if (direct) return direct[1];
  const html = await fetchText(input);
  const m = html.match(/<meta[^>]+content="soundcloud:\/\/users:(\d+)"/i) || html.match(/soundcloud:\/\/users:(\d+)/) || html.match(/soundcloud:users:(\d+)/);
  if (!m) throw new Error(`Couldn't read the SoundCloud account ID from ${input}. Open the profile in your browser, view the page source, search for "soundcloud://users:" and paste this link instead: https://feeds.soundcloud.com/users/soundcloud:users:NUMBER/sounds.rss`);
  return m[1];
}
