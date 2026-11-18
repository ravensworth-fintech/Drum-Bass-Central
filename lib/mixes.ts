// Tells mixes (DJ sets, podcasts, radio shows) apart from single tracks, using the video title.
const EMOJI = /[\u2190-\u2BFF\u{1F000}-\u{1FAFF}\uFE0F\u200D]/gu;
const HASHTAGS = /\s*#[^\s#]+/g;

/** Never a track and never a mix: interviews, trailers, albums, vlogs... */
export const SKIP_WORDS =
  /\binterview\b|\btrailer\b|\bdocumentary\b|\bfull album\b|\baftermovie\b|\brecap\b|\bvlog\b|\btutorial\b|\bbehind the scenes\b|\bplaylist\b|\bcompilation\b/i;

/** Mix-like titles. "Original Mix", "Club Mix" etc. are track versions and do not count. */
export const MIXY =
  /(?<!original |extended |club |vip |radio |dub |instrumental )\bmix\b|\bmegamix\b|\bmixtape\b|\bpodcast\b|\bradio show\b|\blive set\b|\blive at\b|\bdj set\b|\bb2b\b|\bmixed by\b|\bepisode\b|\b\d+ ?(?:hours?|hrs?)\b/i;

export const isMixTitle = (raw: string) => MIXY.test(raw);

export const cleanMixTitle = (raw: string) => raw.replace(EMOJI, " ").replace(HASHTAGS, "").replace(/\s+/g, " ").trim();

/** "Sub Focus - Essential Mix" -> "Sub Focus". Returns null when the left side looks like a mix name, not a person. */
export function guessDj(title: string): string | null {
  const m = title.match(/^(.{2,40}?)\s+[-–—]\s+(.+)$/);
  if (!m) return null;
  const left = m[1].trim();
  return MIXY.test(left) || /\d{4}/.test(left) ? null : left;
}
