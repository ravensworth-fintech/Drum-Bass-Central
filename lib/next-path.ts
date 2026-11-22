// Where to send someone after they sign in (so liking from a shared page brings them back to it). Only same-site paths are accepted.
const KEY = "dtf-next";
export const safeNext = (v: string | null | undefined): string | null => (v && /^\/(?![/\\])/.test(v) ? v : null);
export function rememberNext(path: string | null) { try { if (path) window.localStorage.setItem(KEY, path); } catch { /* ignore */ } }
export function takeNext(): string | null {
  try { const v = safeNext(window.localStorage.getItem(KEY)); window.localStorage.removeItem(KEY); return v; } catch { return null; }
}
