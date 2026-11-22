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
import { authHeaders } from "@/lib/use-session";
import { clearListCache, readListCache, writeListCache } from "@/lib/list-cache";

const PAGE = 30;
type SortKey = "posted" | "artist" | "title";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "posted", label: "Date posted" },
  { key: "artist", label: "Artist name" },
  { key: "title", label: "Song title" },
];
export type ChannelInfo = { name: string; genre: string };

type Cached = { rows: Track[]; more: boolean; channels: ChannelInfo[]; followCount: number };

/** genre shows one genre; leave it out for Fresh Fire, which shows D&B, House and Dubstep together with toggle buttons to narrow it (Bands stays on its own tab).
 *  Lists come from the `my_tracks` view: the channels the signed-in person follows, or the starter channels when signed out.
 *  The first page loads here in the browser (the server can't tell who is signed in); the last page seen is remembered for the tab, so switching lists paints instantly. */
export function TracksBrowser({ genre, label }: { genre?: GenreKey; label: string }) {
  const m = useIsMobile();
  const { updateQueue } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [followCount, setFollowCount] = useState(0);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [genres, setGenres] = useState<GenreKey[]>([]); // Fresh Fire toggles: none pressed = all genres
  const [sortKey, setSortKey] = useState<SortKey>("posted");
  const [asc, setAsc] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); // desktop: search focused, other controls tucked away
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const firstRun = useRef(true);
  const latest = useRef(0);
  const owner = `tracks:${genre ?? "all"}`;

  // Keep the player's "what plays next" in step with what is on screen: filter or search and it follows the visible tracks.
  useEffect(() => { updateQueue(tracks, owner); }, [tracks, owner, updateQueue]);

  async function fetchPage(offset: number): Promise<{ rows: Track[]; more: boolean; error: string }> {
    let query = createClient().from("my_tracks").select("*");
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

  // The channels this person follows (small list), for the channel drop-down and the empty-state message.
  async function loadChannels(): Promise<{ list: ChannelInfo[]; count: number }> {
    const { data } = await createClient().rpc("my_channels");
    const all = (data ?? []) as { name: string; genre: string }[];
    const wanted: string[] = genre ? [genre] : DISCOVER_GENRES;
    const list = all.filter((c) => wanted.includes(c.genre)).map((c) => ({ name: c.name, genre: c.genre })).sort((a, b) => a.name.localeCompare(b.name));
    return { list, count: all.length };
  }

  // First load: show the remembered page at once (if any), then fetch the real first page, the channel list and the sign-in state side by side.
  useEffect(() => {
    let live = true;
    const cached = readListCache<Cached>(`tracks:${genre ?? "all"}`);
    if (cached) { setTracks(cached.rows); setHasMore(cached.more); setChannels(cached.channels); setFollowCount(cached.followCount); setLoading(false); }
    (async () => {
      const [res, ch, sess] = await Promise.all([fetchPage(0), loadChannels(), createClient().auth.getSession()]);
      if (!live) return;
      setErr(res.error);
      setTracks(res.rows); setHasMore(res.more);
      setChannels(ch.list); setFollowCount(ch.count);
      setSignedIn(!!sess.data.session);
      setLoading(false);
      if (!res.error) writeListCache(`tracks:${genre ?? "all"}`, { rows: res.rows, more: res.more, channels: ch.list, followCount: ch.count } satisfies Cached);
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
      {signedIn === false && (
        <p className="mb-3 text-xs text-white/50">You&apos;re seeing the starter channels. <a href="/login" className="text-[#c6ff00] underline">Sign in</a> to follow your own.</p>
      )}
      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {tracks.length ? (
        <TrackList tracks={tracks} title={label} showGenre={!genre} tintHouse={!genre} owner={owner} dividers={sortKey === "posted"} hideActions={!m} />
      ) : (
        !loading && (signedIn && followCount === 0 && !q && !channel && !genres.length ? (
          <div className="border border-white/10 p-5">
            <p className="text-sm text-white/80">You aren&apos;t following any channels yet, so there&apos;s nothing here.</p>
            <p className="mt-1 text-xs text-white/50">Add a YouTube channel or SoundCloud account from your Dashboard, or start with the site&apos;s starter channels and trim the list later.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={startWithStarters} disabled={starting} className="bg-[#c6ff00] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">{starting ? "Following…" : "Follow the starter channels"}</button>
              <a href="/dashboard" className="border border-white/20 px-4 py-2 text-xs uppercase tracking-widest text-white/70 hover:text-white">Open Dashboard</a>
            </div>
          </div>
        ) : <p className="text-white/50">{q || channel || genres.length ? "No tracks match that search." : "No tracks yet."}</p>)
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
