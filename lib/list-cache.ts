// Remembers the first page of each list in this browser tab, so moving between tabs paints instantly while fresh data loads behind it.
// Cleared whenever the person follows/unfollows a channel, signs in or signs out.
const PREFIX = "dtf:list:";
const MAX_AGE = 10 * 60 * 1000;

export function readListCache<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, v } = JSON.parse(raw) as { at: number; v: T };
    return Date.now() - at < MAX_AGE ? v : null;
  } catch { return null; }
}

export function writeListCache(key: string, v: unknown) {
  try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full or blocked: skip */ }
}

export function clearListCache() {
  try {
    const gone: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) { const k = window.sessionStorage.key(i); if (k && k.startsWith(PREFIX)) gone.push(k); }
    gone.forEach((k) => window.sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}
