"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/use-session";
import { clearListCache } from "@/lib/list-cache";
import { GenreToggle, Genre } from "@/components/GenreToggle";

type Src = {
  id: string; name: string; url: string; kind: string; genre: string | null; enabled: boolean; is_artist: boolean; followed: boolean;
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

/**
 * Dashboard list of the channels YOU follow (YouTube and SoundCloud), with a Remove button on each. Removing only changes your own list.
 * Admins also get an "Everyone" view: every channel on the site, with Follow and "Remove for everyone".
 */
export function SourcesManager({ isAdmin = false }: { isAdmin?: boolean }) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [sources, setSources] = useState<Src[] | null>(null);
  const [addsLeft, setAddsLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<Genre>("");
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hide, setHide] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  // "Change link" (admins): re-point a channel at the right YouTube channel / SoundCloud account. Two steps: look the link up, then confirm.
  const [editId, setEditId] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [found, setFound] = useState<{ kind: string; title: string; latest: string[]; url: string } | null>(null);
  const [hideOld, setHideOld] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    setError(""); setSources(null);
    try {
      const res = await fetch(`/api/sources${scope === "all" ? "?scope=all" : ""}`, { headers: await authHeaders(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      setSources(json.sources as Src[]);
      setAddsLeft(typeof json.addsLeft === "number" ? json.addsLeft : null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (sources ?? []).filter((s) => (!genre || (s.genre ?? "dnb") === genre) && (!needle || s.name.toLowerCase().includes(needle)));
  }, [sources, q, genre]);
  const filtering = !!q.trim() || !!genre;
  const shown = showAll || filtering ? visible : visible.slice(0, SHOWN_AT_FIRST);

  async function call(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
    return json;
  }

  /** Remove from MY list (everyone), or from the whole site (admin "Everyone" view, everyone = true). */
  async function remove(s: Src, everyone: boolean) {
    if (busyId) return;
    setBusyId(s.id); setMsg(null);
    try {
      const json = await call("/api/remove-source", { id: s.id, scope: everyone ? "everyone" : "mine", hideTracks: everyone && hide });
      clearListCache();
      setSources((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      setConfirmId(null); setHide(false);
      setMsg({ text: everyone
        ? (hide ? `Removed ${json.name} for everyone and hid ${json.hiddenTracks} tracks and ${json.hiddenMixes} mixes.` : `Removed ${json.name} for everyone. Its tracks and mixes stay on the site.`)
        : `Removed ${json.name} from your channels. Nobody else's list changed.` });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally { setBusyId(null); }
  }

  const closeEdit = () => { setEditId(null); setNewUrl(""); setFound(null); setHideOld(false); setEditErr(""); };

  async function lookUp(s: Src) {
    if (editBusy) return;
    setEditBusy(true); setEditErr(""); setFound(null);
    try { setFound((await call("/api/update-source", { id: s.id, url: newUrl, check: true })).found); }
    catch (e) { setEditErr(e instanceof Error ? e.message : String(e)); }
    finally { setEditBusy(false); }
  }

  async function saveLink(s: Src) {
    if (editBusy) return;
    setEditBusy(true); setEditErr("");
    try {
      const json = await call("/api/update-source", { id: s.id, url: newUrl, hideOld });
      clearListCache();
      setSources((cur) => (cur ?? []).map((x) => (x.id === s.id ? { ...x, url: json.url, kind: json.kind, last_success_at: json.scan?.ok === false ? null : new Date().toISOString(), last_scan_ok: json.scan?.ok === false ? false : true, last_scan_error: json.scan?.error ?? null } : x)));
      closeEdit();
      setMsg({ text: `${json.name} now points at ${json.kind === "soundcloud" ? "SoundCloud" : "YouTube"} "${json.title}".${hideOld ? ` Hid ${json.hiddenTracks} old tracks and ${json.hiddenMixes} old mixes.` : ""}${json.scan?.ok === false ? ` The first scan failed (${json.scan.error}); it will retry on the next scheduled scan.` : ` First scan: ${json.scan?.added ?? 0} new tracks, ${json.scan?.mixes_added ?? 0} new mixes.`}`, bad: json.scan?.ok === false });
    } catch (e) { setEditErr(e instanceof Error ? e.message : String(e)); }
    finally { setEditBusy(false); }
  }

  async function followOne(s: Src) {
    if (busyId) return;
    setBusyId(s.id); setMsg(null);
    try {
      await call("/api/follow", { action: "follow", id: s.id });
      clearListCache();
      setSources((cur) => (cur ?? []).map((x) => (x.id === s.id ? { ...x, followed: true } : x)));
      setMsg({ text: `Following ${s.name}.` });
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }); }
    finally { setBusyId(null); }
  }

  async function startWithStarters() {
    setStarting(true); setMsg(null);
    try {
      const json = await call("/api/follow", { action: "starters" });
      clearListCache();
      setMsg({ text: `Now following ${json.count} starter channels.` });
      await load();
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }); }
    finally { setStarting(false); }
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>;

  const everyoneView = scope === "all";
  const tab = (k: "mine" | "all", label: string) => (
    <button onClick={() => { setScope(k); setShowAll(false); setConfirmId(null); setMsg(null); }} aria-pressed={scope === k}
      className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${scope === k ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{label}</button>
  );

  return (
    <div>
      {isAdmin && <div className="mb-3 flex gap-2">{tab("mine", "My channels")}{tab("all", "Everyone")}</div>}
      {addsLeft !== null && <p className="mb-3 text-xs text-white/50">You can add {addsLeft} more new channel{addsLeft === 1 ? "" : "s"} today (15 per 24 hours).</p>}
      {!sources ? <p className="text-sm text-white/50">Loading channels…</p> : (<>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <GenreToggle value={genre} onChange={(g) => { setGenre(g); setShowAll(false); }} withBands />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" aria-label="Search channels"
            className="w-full border border-white/20 bg-transparent px-3 py-1.5 text-sm sm:w-56" />
        </div>
        {msg && <p className={`mb-3 text-xs ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
        {!visible.length ? (
          sources.length ? <p className="text-sm text-white/50">No channels match.</p> : (
            <div className="border border-white/10 p-4">
              <p className="text-sm text-white/80">{everyoneView ? "No channels on the site yet." : "You aren't following any channels yet."}</p>
              {!everyoneView && (<>
                <p className="mt-1 text-xs text-white/50">Use ADD + above to follow a YouTube channel or SoundCloud account, or start with the site&apos;s starter channels.</p>
                <button onClick={startWithStarters} disabled={starting} className="mt-3 bg-[#c6ff00] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{starting ? "Following…" : "Follow the starter channels"}</button>
              </>)}
            </div>
          )
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
                      {everyoneView && s.followed && <span className="text-[#c6ff00]"> · you follow it</span>}
                    </p>
                  </div>
                  {confirmId !== s.id && editId !== s.id && (
                    <div className="flex shrink-0 gap-2">
                      {isAdmin && (
                        <button onClick={() => { closeEdit(); setEditId(s.id); setMsg(null); setNewUrl(""); }}
                          className="border border-white/20 px-3 py-1 text-xs uppercase tracking-widest text-white/70 hover:border-[#c6ff00] hover:text-[#c6ff00]">Change link</button>
                      )}
                      {everyoneView && !s.followed && (
                        <button onClick={() => followOne(s)} disabled={busyId === s.id}
                          className="border border-[#c6ff00] px-3 py-1 text-xs uppercase tracking-widest text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black disabled:opacity-40">Follow</button>
                      )}
                      <button onClick={() => { setConfirmId(s.id); setHide(false); setMsg(null); }}
                        className="border border-white/20 px-3 py-1 text-xs uppercase tracking-widest text-white/70 hover:border-red-400 hover:text-red-400">{everyoneView ? "Remove for everyone" : "Remove"}</button>
                    </div>
                  )}
                </div>
                {editId === s.id && (
                  <div className="mt-3 border border-[#c6ff00]/40 p-3">
                    <p className="text-xs text-white/80">Paste the correct YouTube channel or SoundCloud account link for {s.name}. The name stays the same, and this changes it for everyone who follows it.</p>
                    <p className="mt-1 break-all text-[11px] text-white/40">Now: {s.url}</p>
                    <input value={newUrl} onChange={(e) => { setNewUrl(e.target.value); setFound(null); setEditErr(""); }} placeholder="https://www.youtube.com/@Handle or https://soundcloud.com/name"
                      aria-label="New channel link" className="mt-2 w-full border border-white/20 bg-transparent px-3 py-1.5 text-sm" />
                    {found && (
                      <div className="mt-2 border border-white/15 p-2 text-xs">
                        <p className="text-[#c6ff00]">Found {found.kind === "soundcloud" ? "SoundCloud" : "YouTube"}: {found.title}</p>
                        {found.latest.length > 0 && <p className="mt-1 text-white/50">Latest: {found.latest.map((t) => `“${t}”`).join(", ")}</p>}
                        <label className="mt-2 flex items-start gap-2 text-white/60">
                          <input type="checkbox" checked={hideOld} onChange={(e) => setHideOld(e.target.checked)} className="mt-0.5 accent-[#c6ff00]" />
                          <span>Also hide the tracks and mixes already filed under {s.name} (use this if they came from the wrong account; nothing is deleted)</span>
                        </label>
                      </div>
                    )}
                    {editErr && <p className="mt-2 text-xs text-red-400">{editErr}</p>}
                    <div className="mt-3 flex gap-2">
                      {found
                        ? <button onClick={() => saveLink(s)} disabled={editBusy} className="bg-[#c6ff00] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{editBusy ? "Saving…" : "Use this channel"}</button>
                        : <button onClick={() => lookUp(s)} disabled={editBusy || !newUrl.trim()} className="bg-[#c6ff00] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{editBusy ? "Checking…" : "Check link"}</button>}
                      <button onClick={closeEdit} disabled={editBusy} className="border border-white/20 px-4 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:text-white">Cancel</button>
                    </div>
                  </div>
                )}
                {confirmId === s.id && (
                  <div className="mt-3 border border-red-400/40 p-3">
                    {everyoneView ? (<>
                      <p className="text-xs text-white/80">Remove {s.name} from the whole site? Nobody will follow it any more, new uploads stop being added, and Discover won&apos;t suggest it again.</p>
                      <label className="mt-2 flex items-start gap-2 text-xs text-white/60">
                        <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="mt-0.5 accent-[#c6ff00]" />
                        <span>Also hide its tracks and mixes already on the site for everyone (tracks people liked from it will disappear from their Likes too)</span>
                      </label>
                    </>) : (
                      <p className="text-xs text-white/80">Stop following {s.name}? It leaves your lists only. Nobody else&apos;s channels change, and tracks you already liked stay in your Likes.</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => remove(s, everyoneView)} disabled={busyId === s.id}
                        className="bg-red-400 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{busyId === s.id ? "Removing…" : everyoneView ? "Remove for everyone" : "Remove channel"}</button>
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
      </>)}
    </div>
  );
}
