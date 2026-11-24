"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { DayDivider, Track, TrackRow, dayKey } from "@/components/TrackList";
import { Mix, MixTracklist } from "@/components/MixTracklist";
import { Genre, GenreToggle } from "@/components/GenreToggle";
import { useIsMobile } from "@/components/DeviceProvider";
import { PlayActions } from "@/components/PlayActions";
import { onItemRemoved } from "@/components/RemoveItemButton";
import { authHeaders } from "@/lib/use-session";
import { clearListCache, readListCache, writeListCache } from "@/lib/list-cache";

const PAGE = 30;

const toTrack = (m: Mix): Track => ({
  id: m.id, title: m.title, artist_name: m.dj_name ?? m.show_or_channel ?? "", subgenre: "Unknown", artwork_url: m.artwork_url,
  source_url: m.source_url, embed_url: m.embed_url, released_on: m.uploaded_at ? m.uploaded_at.slice(0, 10) : null,
  source_name: m.show_or_channel, duration_seconds: m.duration_seconds, genre: m.genre, kind: "mix",
});


type Cached = { rows: Mix[]; more: boolean; channels: { name: string; genre: string }[]; followCount: number };

/** Mixes from the channels the signed-in person follows (starter channels when signed out), from the `my_mixes` view. Loads in the browser; the last page seen is remembered for the tab. */
export function MixesBrowser() {
  const m = useIsMobile();
  const [mixes, setMixes] = useState<Mix[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [channels, setChannels] = useState<{ name: string; genre: string }[]>([]);
  const [followCount, setFollowCount] = useState(0);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [genre, setGenre] = useState<Genre>("");
  const [onlyTl, setOnlyTl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const firstRun = useRef(true);
  const latest = useRef(0);

  async function fetchPage(offset: number): Promise<{ rows: Mix[]; more: boolean; error: string }> {
    let query = createClient()
      .from("my_mixes")
      .select("id,title,dj_name,show_or_channel,uploaded_at,duration_seconds,artwork_url,source_url,embed_url,tracklist_status,tracklist_origin,genre")
      .order("uploaded_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + PAGE); // PAGE + 1 rows: the extra one tells us there is more
    const term = q.trim().replace(/[,()%*\\]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,dj_name.ilike.%${term}%,show_or_channel.ilike.%${term}%`);
    if (genre) query = query.eq("genre", genre);
    if (channel) query = query.eq("show_or_channel", channel);
    if (onlyTl) query = query.eq("tracklist_status", "matched");
    const { data, error } = await query;
    const all = (data ?? []) as Mix[];
    return { rows: all.slice(0, PAGE), more: all.length > PAGE, error: error?.message ?? "" };
  }

  // A mix removed with its X disappears from this list at once.
  useEffect(() => onItemRemoved((d) => { if (d.kind === "mix") setMixes((ms) => ms.filter((x) => x.id !== d.id)); }), []);

  // First load: remembered page at once (if any), then the real first page, the channel list and the sign-in state side by side.
  useEffect(() => {
    let live = true;
    const cached = readListCache<Cached>("mixes");
    if (cached) { setMixes(cached.rows); setHasMore(cached.more); setChannels(cached.channels); setFollowCount(cached.followCount); setLoading(false); }
    (async () => {
      const sb = createClient();
      const [res, chs, mine, sess] = await Promise.all([fetchPage(0), sb.from("my_mix_channels").select("name,genre"), sb.rpc("my_channels"), sb.auth.getSession()]);
      if (!live) return;
      const list = ((chs.data ?? []) as { name: string; genre: string }[]).sort((a, b) => a.name.localeCompare(b.name));
      const count = ((mine.data ?? []) as unknown[]).length;
      setErr(res.error); setMixes(res.rows); setHasMore(res.more); setChannels(list); setFollowCount(count);
      setSignedIn(!!sess.data.session); setLoading(false);
      if (!res.error) writeListCache("mixes", { rows: res.rows, more: res.more, channels: list, followCount: count } satisfies Cached);
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line

  async function startWithStarters() {
    setStarting(true);
    try {
      const res = await fetch("/api/follow", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ action: "starters" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      clearListCache();
      window.location.reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setStarting(false); }
  }

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const id = ++latest.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await fetchPage(0);
      if (id !== latest.current) return;
      setErr(res.error); setMixes(res.rows); setHasMore(res.more); setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, channel, genre, onlyTl]); // eslint-disable-line

  async function loadMore() {
    setLoading(true);
    const res = await fetchPage(mixes.length);
    setErr(res.error);
    setMixes((prev) => { const have = new Set(prev.map((p) => p.id)); return [...prev, ...res.rows.filter((r) => !have.has(r.id))]; });
    setHasMore(res.more); setLoading(false);
  }

  const queue = useMemo(() => mixes.map(toTrack), [mixes]);
  // The channel list follows the genre pill; a channel is listed once even if it has mixes in both genres.
  const channelNames = useMemo(() => Array.from(new Set(channels.filter((c) => !genre || c.genre === genre).map((c) => c.name))), [channels, genre]);

  function pickGenre(g: Genre) {
    setGenre(g);
    if (channel && !channels.some((c) => c.name === channel && (!g || c.genre === g))) setChannel("");
  }

  return (
    <div>
      <div className={m ? "mb-3 grid grid-cols-1 gap-2" : "mb-4 flex flex-wrap items-center gap-3"}>
        <GenreToggle value={genre} onChange={pickGenre} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mixes, DJs or shows" className={`border border-white/20 bg-transparent px-3 text-sm ${m ? "w-full py-2.5" : "py-1.5"}`} />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`border border-white/20 bg-black px-3 text-sm ${m ? "w-full py-2.5" : "py-1.5"}`}>
          <option value="">All channels</option>
          {channelNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className={`flex items-center gap-2 text-white/70 ${m ? "py-1 text-base" : "text-sm"}`}>
          <input type="checkbox" checked={onlyTl} onChange={(e) => setOnlyTl(e.target.checked)} className="accent-[#c6ff00]" /> Only with tracklist
        </label>
        {loading && <span className="text-xs text-white/50">Loading…</span>}
      </div>
      {signedIn === false && (
        <p className="mb-3 text-xs text-white/50">You&apos;re seeing the starter channels. <a href="/login" className="text-[#c6ff00] underline">Sign in</a> to follow your own.</p>
      )}
      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {mixes.length ? (<>
        <PlayActions tracks={queue} owner="mixes" hideShuffle />
        <ul className="divide-y divide-white/10">
          {mixes.flatMap((m, i) => {
            const day = dayKey(m.uploaded_at);
            const rows: React.ReactNode[] = [];
            if (day && day !== (i ? dayKey(mixes[i - 1].uploaded_at) : null)) rows.push(<DayDivider key={`day-${day}-${i}`} day={day} />);
            rows.push(<TrackRow key={m.id} t={queue[i]} queue={queue} noSC showGenre={!genre} action={null} below={<MixTracklist mix={m} />} />);
            return rows;
          })}
        </ul>
      </>) : (
        !loading && (signedIn && followCount === 0 && !q && !channel && !genre && !onlyTl ? (
          <div className="border border-white/10 p-5">
            <p className="text-sm text-white/80">You aren&apos;t following any channels yet, so there&apos;s nothing here.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={startWithStarters} disabled={starting} className="bg-[#c6ff00] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{starting ? "Following…" : "Follow the starter channels"}</button>
              <a href="/dashboard" className="border border-white/20 px-4 py-2 text-xs uppercase tracking-widest text-white/70 hover:text-white">Open Dashboard</a>
            </div>
          </div>
        ) : <p className="text-white/50">{q || channel || genre || onlyTl ? "No mixes match that search." : "No mixes yet. They appear after the next scan."}</p>)
      )}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button onClick={loadMore} disabled={loading}
            className="border border-white/30 px-5 py-2 text-xs uppercase tracking-widest hover:border-[#c6ff00] hover:text-[#c6ff00] disabled:opacity-40">
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
