"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TrackList, Track, scSearchUrl } from "@/components/TrackList";
import { useIsMobile } from "@/components/DeviceProvider";
import { DISCOVER_GENRES, GenreKey } from "@/lib/genres";

const PAGE = 30;

/** genre shows one genre; leave it out for Fresh Fire, which shows D&B, House and Dubstep together (Bands stays on its own tab). */
export function TracksBrowser({ initial, channels, genre, label }: { initial: Track[]; channels: string[]; genre?: GenreKey; label: string }) {
  const m = useIsMobile();
  const [tracks, setTracks] = useState<Track[]>(initial.slice(0, PAGE));
  const [hasMore, setHasMore] = useState(initial.length > PAGE);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(true);
  const latest = useRef(0);

  async function fetchPage(offset: number): Promise<{ rows: Track[]; more: boolean; error: string }> {
    let query = createClient()
      .from("tracks")
      .select("*")
      .order("released_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + PAGE); // PAGE + 1 rows: the extra one tells us there is more
    const term = q.trim().replace(/[,()%*\\]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,artist_name.ilike.%${term}%`);
    query = genre ? query.eq("genre", genre) : query.in("genre", DISCOVER_GENRES);
    if (channel) query = query.eq("source_name", channel);
    const { data, error } = await query;
    const all = (data ?? []) as Track[];
    return { rows: all.slice(0, PAGE), more: all.length > PAGE, error: error?.message ?? "" };
  }

  // Re-run the search shortly after the person stops typing or changes the channel.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const id = ++latest.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await fetchPage(0);
      if (id !== latest.current) return; // a newer search started
      setErr(res.error);
      setTracks(res.rows);
      setHasMore(res.more);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, channel]); // eslint-disable-line

  async function loadMore() {
    setLoading(true);
    const res = await fetchPage(tracks.length);
    setErr(res.error);
    setTracks((prev) => {
      const have = new Set(prev.map((p) => p.id));
      return [...prev, ...res.rows.filter((r) => !have.has(r.id))];
    });
    setHasMore(res.more);
    setLoading(false);
  }

  return (
    <div>
      <div className={m ? "mb-3 grid grid-cols-1 gap-2" : "mb-4 flex flex-wrap items-center gap-3"}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artist or title"
          className={`border border-white/20 bg-transparent px-3 text-sm ${m ? "w-full py-2.5" : "py-1.5"}`} />
        <select value={channel} onChange={(e) => setChannel(e.target.value)}
          className={`border border-white/20 bg-black px-3 text-sm ${m ? "w-full py-2.5" : "py-1.5"}`}>
          <option value="">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {q.trim() && (
          <a href={scSearchUrl(q.trim())} target="_blank" rel="noreferrer"
            className={`border border-white/20 px-3 text-xs uppercase tracking-widest hover:border-[#c6ff00] hover:text-[#c6ff00] ${m ? "py-2.5 text-center" : "py-1.5"}`}>Search SoundCloud ↗</a>
        )}
        {loading && <span className="text-xs text-white/50">Loading…</span>}
      </div>
      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {tracks.length ? (
        <TrackList tracks={tracks} title={label} showGenre={!genre} tintHouse={!genre} />
      ) : (
        !loading && <p className="text-white/50">{q || channel ? "No tracks match that search." : "No tracks yet."}</p>
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
