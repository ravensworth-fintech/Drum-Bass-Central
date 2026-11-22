"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/use-session";
import { GenreToggle, Genre } from "@/components/GenreToggle";

type Src = {
  id: string; name: string; url: string; kind: string; genre: string | null; enabled: boolean; is_artist: boolean;
  last_success_at: string | null; last_scan_ok: boolean | null; last_scan_error: string | null;
};

const GENRE_LABEL: Record<string, string> = { dnb: "D&B", house: "House", dubstep: "Dubstep", bands: "Bands" };
const SHOWN_AT_FIRST = 40;

function ago(iso: string | null): string {
  if (!iso) return "never scanned";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

/** Dashboard list of every channel the site follows (YouTube and SoundCloud), with a Remove button on each. Admin only. */
export function SourcesManager() {
  const [sources, setSources] = useState<Src[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<Genre>("");
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hide, setHide] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/sources", { headers: await authHeaders(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      setSources(json.sources as Src[]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (sources ?? []).filter((s) => (!genre || (s.genre ?? "dnb") === genre) && (!needle || s.name.toLowerCase().includes(needle)));
  }, [sources, q, genre]);
  const filtering = !!q.trim() || !!genre;
  const shown = showAll || filtering ? visible : visible.slice(0, SHOWN_AT_FIRST);

  async function remove(s: Src) {
    if (busyId) return;
    setBusyId(s.id); setMsg(null);
    try {
      const res = await fetch("/api/remove-source", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ id: s.id, hideTracks: hide }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      setSources((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      setConfirmId(null); setHide(false);
      setMsg({ text: hide ? `Removed ${json.name} and hid ${json.hiddenTracks} tracks and ${json.hiddenMixes} mixes.` : `Removed ${json.name}. Its tracks and mixes stay on the site.` });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally { setBusyId(null); }
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!sources) return <p className="text-sm text-white/50">Loading channels…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <GenreToggle value={genre} onChange={(g) => { setGenre(g); setShowAll(false); }} withBands />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" aria-label="Search channels"
          className="w-full border border-white/20 bg-transparent px-3 py-1.5 text-sm sm:w-56" />
      </div>
      {msg && <p className={`mb-3 text-xs ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
      {!visible.length ? (
        <p className="text-sm text-white/50">{sources.length ? "No channels match." : "No channels yet. Use ADD + above to follow one."}</p>
      ) : (
        <ul className="divide-y divide-white/10 border border-white/10">
          {shown.map((s) => (
            <li key={s.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-bold hover:text-[#c6ff00]">{s.name}</a>
                  <p className="mt-0.5 text-xs text-white/50">
                    {s.kind === "soundcloud" ? "SoundCloud" : "YouTube"} · {GENRE_LABEL[s.genre ?? "dnb"] ?? s.genre} · scanned {ago(s.last_success_at)}
                    {!s.enabled && <span className="text-white/70"> · paused</span>}
                    {s.last_scan_ok === false && <span className="text-red-400" title={s.last_scan_error ?? undefined}> · last scan failed</span>}
                  </p>
                </div>
                {confirmId !== s.id && (
                  <button onClick={() => { setConfirmId(s.id); setHide(false); setMsg(null); }}
                    className="shrink-0 border border-white/20 px-3 py-1 text-xs uppercase tracking-widest text-white/70 hover:border-red-400 hover:text-red-400">Remove</button>
                )}
              </div>
              {confirmId === s.id && (
                <div className="mt-3 border border-red-400/40 p-3">
                  <p className="text-xs text-white/80">Stop following {s.name}? New uploads will no longer be added, and Discover won&apos;t suggest it again.</p>
                  <label className="mt-2 flex items-start gap-2 text-xs text-white/60">
                    <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="mt-0.5 accent-[#c6ff00]" />
                    <span>Also hide its tracks and mixes already on the site (tracks you liked from it will disappear from Likes too)</span>
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => remove(s)} disabled={busyId === s.id}
                      className="bg-red-400 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{busyId === s.id ? "Removing…" : "Remove channel"}</button>
                    <button onClick={() => setConfirmId(null)} disabled={busyId === s.id}
                      className="border border-white/20 px-4 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:text-white">Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!filtering && !showAll && visible.length > SHOWN_AT_FIRST && (
        <button onClick={() => setShowAll(true)} className="mt-3 text-xs uppercase tracking-widest text-white/60 underline hover:text-white">Show all {visible.length} channels</button>
      )}
    </div>
  );
}
