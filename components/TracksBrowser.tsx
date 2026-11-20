"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TrackList, Track, scSearchUrl } from "@/components/TrackList";
import { useIsMobile } from "@/components/DeviceProvider";
import { MultiGenreToggle } from "@/components/GenreToggle";
import { usePlayer } from "@/components/PlayerProvider";
import { CollapsibleSearch } from "@/components/CollapsibleSearch";
import { MobileFilters } from "@/components/MobileFilters";
import { PlayActions } from "@/components/PlayActions";
import { DISCOVER_GENRES, GenreKey } from "@/lib/genres";

const PAGE = 30;
type SortKey = "posted" | "artist" | "title";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "posted", label: "Date posted" },
  { key: "artist", label: "Artist name" },
  { key: "title", label: "Song title" },
];
export type ChannelInfo = { name: string; genre: string };

/** genre shows one genre; leave it out for Fresh Fire, which shows D&B, House and Dubstep together with toggle buttons to narrow it (Bands stays on its own tab). */
export function TracksBrowser({ initial, channels, genre, label }: { initial: Track[]; channels: ChannelInfo[]; genre?: GenreKey; label: string }) {
  const m = useIsMobile();
  const { updateQueue } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>(initial.slice(0, PAGE));
  const [hasMore, setHasMore] = useState(initial.length > PAGE);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [genres, setGenres] = useState<GenreKey[]>([]); // Fresh Fire toggles: none pressed = all genres
  const [sortKey, setSortKey] = useState<SortKey>("posted");
  const [asc, setAsc] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); // desktop: search focused, other controls tucked away
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const firstRun = useRef(true);
  const latest = useRef(0);
  const owner = `tracks:${genre ?? "all"}`;

  // Keep the player's "what plays next" in step with what is on screen: filter or search and it follows the visible tracks.
  useEffect(() => { updateQueue(tracks, owner); }, [tracks, owner, updateQueue]);

  async function fetchPage(offset: number): Promise<{ rows: Track[]; more: boolean; error: string }> {
    let query = createClient().from("tracks").select("*");
    const term = q.trim().replace(/[,()%*\\]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,artist_name.ilike.%${term}%`);
    query = query.in("genre", genre ? [genre] : genres.length ? genres : DISCOVER_GENRES);
    if (channel) query = query.eq("source_name", channel);
    if (sortKey === "posted") query = query.order("released_on", { ascending: asc, nullsFirst: false }).order("created_at", { ascending: asc });
    else if (sortKey === "artist") query = query.order("artist_name", { ascending: asc }).order("title", { ascending: true });
    else query = query.order("title", { ascending: asc }).order("artist_name", { ascending: true });
    const { data, error } = await query.order("id").range(offset, offset + PAGE); // PAGE + 1 rows: the extra one tells us there is more
    const all = (data ?? []) as Track[];
    return { rows: all.slice(0, PAGE), more: all.length > PAGE, error: error?.message ?? "" };
  }

  // Re-run the search shortly after the person stops typing or changes a filter / the sort.
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
  }, [q, channel, genres, sortKey, asc]); // eslint-disable-line

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

  // The channel list follows the genre buttons.
  const channelNames = useMemo(
    () => Array.from(new Set(channels.filter((c) => !genres.length || genres.includes(c.genre as GenreKey)).map((c) => c.name))).sort((a, b) => a.localeCompare(b)),
    [channels, genres]
  );

  function toggleGenre(g: GenreKey) {
    const next = genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g];
    setGenres(next);
    if (channel && !channels.some((c) => c.name === channel && (!next.length || next.includes(c.genre as GenreKey)))) setChannel("");
  }
  function changeSort(k: SortKey) {
    setSortKey(k);
    setAsc(k !== "posted"); // names default A-Z, dates default newest first
  }

  const dirLabel = sortKey === "posted" ? (asc ? "Oldest first" : "Newest first") : (asc ? "A → Z" : "Z → A");
  const field = `border border-white/20 px-3 text-sm ${m ? "w-full py-2.5" : "py-1.5"}`;
  const btn = `border border-white/20 px-3 text-xs uppercase tracking-widest hover:border-white/50 ${m ? "py-2.5" : "py-1.5"}`;
  const search = <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artist or title" className={`bg-transparent ${field}`} />;
  const channelSel = (
    <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel" className={`bg-black ${field}`}>
      <option value="">All channels</option>
      {channelNames.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
  const sortSel = (
    <select value={sortKey} onChange={(e) => changeSort(e.target.value as SortKey)} aria-label="Sort by" className={`bg-black ${field}`}>
      {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
    </select>
  );
  const dirBtn = <button onClick={() => setAsc(!asc)} className={btn}>{dirLabel}</button>;
  const scLink = q.trim() ? (
    <a href={scSearchUrl(q.trim())} target="_blank" rel="noreferrer"
      className={`shrink-0 whitespace-nowrap border border-white/20 px-3 text-xs uppercase tracking-widest hover:border-[#c6ff00] hover:text-[#c6ff00] ${m ? "py-2.5 text-center" : "py-1.5"}`}>Search SoundCloud ↗</a>
  ) : null;
  const activeCount = (q.trim() ? 1 : 0) + (channel ? 1 : 0) + (genres.length ? 1 : 0) + (sortKey !== "posted" || asc ? 1 : 0);

  return (
    <div>
      {m ? (
        <MobileFilters active={activeCount}>
          <div className="grid grid-cols-2 gap-2">
            {!genre && <div className="col-span-2"><MultiGenreToggle values={genres} onToggle={toggleGenre} /></div>}
            <div className="col-span-2">{search}</div>
            {channelSel}
            {sortSel}
            <div className="col-span-2">{dirBtn}</div>
            {scLink && <div className="col-span-2 flex flex-col">{scLink}</div>}
          </div>
        </MobileFilters>
      ) : (
        <div className="mb-4 space-y-3">
          {/* Row 1: genre buttons on the left, Shuffle / Random on the right */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>{!genre && <MultiGenreToggle values={genres} onToggle={toggleGenre} />}</div>
            {tracks.length > 0 && <PlayActions bare tracks={tracks} owner={owner} />}
          </div>
          {/* Row 2: channel, sort and search (search grows and tucks the others away while you type) */}
          <div className="flex flex-wrap items-center gap-3">
            {!searchOpen && (<>
              {channelSel}
              {sortSel}
              {dirBtn}
            </>)}
            {loading && <span className="text-xs text-white/50">Loading…</span>}
            <div className={`flex items-center gap-3 ${searchOpen ? "min-w-0 flex-1" : "ml-auto"}`}>
              {scLink}
              <CollapsibleSearch value={q} onChange={setQ} placeholder="Search" open={searchOpen} onOpenChange={setSearchOpen} />
            </div>
          </div>
        </div>
      )}
      {m && loading && <p className="mb-2 text-xs text-white/50">Loading…</p>}
      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {tracks.length ? (
        <TrackList tracks={tracks} title={label} showGenre={!genre} tintHouse={!genre} owner={owner} dividers={sortKey === "posted"} hideActions={!m} />
      ) : (
        !loading && <p className="text-white/50">{q || channel || genres.length ? "No tracks match that search." : "No tracks yet."}</p>
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
