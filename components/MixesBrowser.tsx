"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Track, TrackRow } from "@/components/TrackList";
import { Mix, MixTracklist } from "@/components/MixTracklist";

const PAGE = 30;

const toTrack = (m: Mix): Track => ({
  id: m.id, title: m.title, artist_name: m.dj_name ?? m.show_or_channel ?? "", subgenre: "Unknown", artwork_url: m.artwork_url,
  source_url: m.source_url, embed_url: m.embed_url, released_on: m.uploaded_at ? m.uploaded_at.slice(0, 10) : null,
  source_name: m.show_or_channel, duration_seconds: m.duration_seconds, genre: m.genre,
});

type Genre = "" | "dnb" | "house";
const GENRES: { key: Genre; label: string }[] = [{ key: "", label: "All" }, { key: "dnb", label: "D&B" }, { key: "house", label: "House" }];

export function MixesBrowser({ initial, channels }: { initial: Mix[]; channels: { name: string; genre: string }[] }) {
  const [mixes, setMixes] = useState<Mix[]>(initial.slice(0, PAGE));
  const [hasMore, setHasMore] = useState(initial.length > PAGE);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [genre, setGenre] = useState<Genre>("");
  const [onlyTl, setOnlyTl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(true);
  const latest = useRef(0);

  async function fetchPage(offset: number): Promise<{ rows: Mix[]; more: boolean; error: string }> {
    let query = createClient()
      .from("mixes")
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex">
          {GENRES.map((g) => (
            <button key={g.key} onClick={() => pickGenre(g.key)} aria-pressed={genre === g.key}
              className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${genre === g.key ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70 hover:text-white"}`}>{g.label}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mixes, DJs or shows" className="border border-white/20 bg-transparent px-3 py-1.5 text-sm" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="border border-white/20 bg-black px-3 py-1.5 text-sm">
          <option value="">All channels</option>
          {channelNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={onlyTl} onChange={(e) => setOnlyTl(e.target.checked)} className="accent-[#c6ff00]" /> Only with tracklist
        </label>
        {loading && <span className="text-xs text-white/50">Loading…</span>}
      </div>
      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {mixes.length ? (
        <ul className="divide-y divide-white/10">
          {mixes.map((m, i) => <TrackRow key={m.id} t={queue[i]} queue={queue} noSC showGenre={!genre} action={null} below={<MixTracklist mix={m} />} />)}
        </ul>
      ) : (
        !loading && <p className="text-white/50">{q || channel || genre || onlyTl ? "No mixes match that search." : "No mixes yet. They appear after the next scan."}</p>
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
