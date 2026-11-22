"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authHeaders, useSession } from "@/lib/use-session";

type Sug = {
  id: string; name: string; platform_id: string | null; url: string | null; genre: string; reason: string | null; evidence_count: number;
  thumbnail_url: string | null; subscribers: number | null; description: string | null; last_upload_at: string | null;
};
type GenreKey = "dnb" | "house" | "dubstep" | "bands";
const GENRES: { key: GenreKey; label: string }[] = [{ key: "dnb", label: "D&B" }, { key: "house", label: "House" }, { key: "dubstep", label: "Dubstep" }, { key: "bands", label: "Bands" }];

const subs = (n: number | null) => (n == null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M subscribers` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K subscribers` : `${n} subscribers`);
function ago(iso: string | null) {
  if (!iso) return null;
  const days = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86400_000));
  return days === 0 ? "last upload today" : days === 1 ? "last upload yesterday" : `last upload ${days} days ago`;
}

/** The Discover page: channels the daily job found, each with Add or Skip. Admin only. */
export default function DiscoverClient() {
  const { ready, email, admin } = useSession();
  const [list, setList] = useState<Sug[] | null>(null);
  const [error, setError] = useState("");
  const [genres, setGenres] = useState<Record<string, GenreKey>>({});
  const [artistOwn, setArtistOwn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/suggestions", { headers: await authHeaders(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      setList(json.suggestions as Sug[]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { if (admin) load(); }, [admin, load]);

  async function decide(s: Sug, action: "add" | "skip") {
    if (busy) return;
    setBusy(s.id); setMsg(null);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ id: s.id, action, genre: genres[s.id] ?? s.genre, isArtist: artistOwn[s.id] ?? true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      setList((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      if (action === "skip") setMsg({ text: `Skipped ${s.name}. It won't be suggested again.` });
      else if (json.scan?.ok === false) setMsg({ text: `${json.name} was added, but the first scan failed: ${json.scan.error}`, bad: true });
      else setMsg({ text: `Added ${json.name}: ${json.scan?.added ?? 0} new tracks, ${json.scan?.mixes_added ?? 0} new mixes.` });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally { setBusy(null); }
  }

  if (!ready) return <p className="text-sm text-white/50">Loading…</p>;
  if (!email || !admin) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-black uppercase sm:text-3xl">Discover</h1>
        <p className="text-sm text-white/70">{email ? "Only admin accounts can review suggestions." : "Sign in with your admin account to review suggestions."}</p>
        <Link href={email ? "/dashboard" : "/login"} className="mt-4 inline-block text-xs uppercase tracking-widest text-white/60 underline hover:text-white">{email ? "Back to Dashboard" : "Sign in"}</Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase sm:text-3xl">Discover</h1>
        <Link href="/dashboard" className="text-xs uppercase tracking-widest text-white/60 underline hover:text-white">Dashboard</Link>
      </div>
      <p className="mb-6 text-sm text-white/50">Channels of artists credited on tracks you already have, found once a day. Add follows the channel and scans it now. Skip hides it for good.</p>
      {msg && <p className={`mb-4 text-xs ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {list && !list.length && !error && <p className="text-sm text-white/60">No suggestions waiting. New ones are looked for once a day.</p>}
      {!list && !error && <p className="text-sm text-white/50">Loading suggestions…</p>}
      <ul className="space-y-4">
        {(list ?? []).map((s) => {
          const g = genres[s.id] ?? (s.genre as GenreKey);
          const meta = [subs(s.subscribers), ago(s.last_upload_at)].filter(Boolean).join(" · ");
          return (
            <li key={s.id} className="border border-white/10 p-4">
              <div className="flex gap-4">
                {s.thumbnail_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.thumbnail_url} alt="" className="h-16 w-16 shrink-0 object-cover" />}
                <div className="min-w-0">
                  <a href={s.url ?? `https://www.youtube.com/channel/${s.platform_id}`} target="_blank" rel="noreferrer" className="block truncate font-bold hover:text-[#c6ff00]">{s.name}</a>
                  {meta && <p className="mt-0.5 text-xs text-white/50">{meta}</p>}
                  {s.reason && <p className="mt-1 text-xs text-white/70">{s.reason}</p>}
                </div>
              </div>
              {s.description && <p className="mt-3 text-xs text-white/40">{s.description}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {GENRES.map((x) => (
                  <button key={x.key} onClick={() => setGenres((c) => ({ ...c, [s.id]: x.key }))} aria-pressed={g === x.key}
                    className={`border px-3 py-1 text-xs font-bold uppercase tracking-widest ${g === x.key ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{x.label}</button>
                ))}
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-white/60">
                <input type="checkbox" checked={artistOwn[s.id] ?? true} onChange={(e) => setArtistOwn((c) => ({ ...c, [s.id]: e.target.checked }))} className="mt-0.5 accent-[#c6ff00]" />
                <span>An artist&apos;s own channel (uploads are titled with just the track name)</span>
              </label>
              <div className="mt-4 flex gap-2">
                <button onClick={() => decide(s, "add")} disabled={busy === s.id}
                  className="bg-[#c6ff00] px-5 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{busy === s.id ? "Working…" : "Add"}</button>
                <button onClick={() => decide(s, "skip")} disabled={busy === s.id}
                  className="border border-white/20 px-5 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:border-white/50 hover:text-white disabled:opacity-40">Skip</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
