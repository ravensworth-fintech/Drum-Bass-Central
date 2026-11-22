"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { DayDivider, Track, TrackRow, dayKey } from "@/components/TrackList";
import { LikeButton } from "@/components/LikeButton";
import { usePublishPdf } from "@/lib/pdf-source";
import { Genre, GenreToggle } from "@/components/GenreToggle";
import { useIsMobile } from "@/components/DeviceProvider";
import { usePlayer } from "@/components/PlayerProvider";
import { CollapsibleSearch } from "@/components/CollapsibleSearch";
import { MobileFilters } from "@/components/MobileFilters";
import { PlayActions } from "@/components/PlayActions";

type Row = { liked_at: string; tracks: Track };
type SortKey = "liked" | "posted" | "artist" | "title";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "liked", label: "Date liked" },
  { key: "posted", label: "Date posted" },
  { key: "artist", label: "Artist name" },
  { key: "title", label: "Song title" },
];

type Page = { data: unknown; error: { message: string } | null };
/** Reads a list 1,000 rows at a time (the API's page size), so nobody silently loses likes past the first 1,000. */
async function pageAll<T>(get: (from: number, to: number) => PromiseLike<Page>): Promise<{ rows: T[]; error: string }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await get(from, from + 999);
    if (error) return { rows, error: error.message };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 1000) return { rows, error: "" };
  }
}

/** Your own Likes page, or (with shareCode) someone else's likes opened from their read-only link:
 *  you can play, search, sort, select and Copy Links, and the heart likes a track onto YOUR account without touching theirs. */
export default function LikedClient({ shareCode }: { shareCode?: string }) {
  const shared = !!shareCode;
  const owner = shared ? "shared-likes" : "liked";
  const [viewerLiked, setViewerLiked] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const m = useIsMobile();
  const { updateQueue } = usePlayer();
  const [selectMode, setSelectMode] = useState(false); // phones: checkboxes + copy/select buttons only appear in Select mode
  const [rows, setRows] = useState<Row[] | null>(null);
  const [authed, setAuthed] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [genre, setGenre] = useState<Genre>("");
  const [sortKey, setSortKey] = useState<SortKey>("liked");
  const [asc, setAsc] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const [searchOpen, setSearchOpen] = useState(false); // desktop: search focused, other controls tucked away

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (shared) {
        const { data: sess } = await supabase.auth.getSession();
        setSignedIn(!!sess.session);
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(shareCode!)) { setRows([]); return; } // not a real code: nothing to look up
        const [theirs, mine] = await Promise.all([
          pageAll<Row>((a, b) => supabase.rpc("shared_likes", { share_code: shareCode }).range(a, b)),
          sess.session ? pageAll<{ track_id: string }>((a, b) => supabase.from("liked_tracks").select("track_id").order("track_id").range(a, b)) : Promise.resolve({ rows: [] as { track_id: string }[], error: "" }),
        ]);
        if (theirs.error) setErr(theirs.error);
        setViewerLiked(new Set(mine.rows.map((r) => r.track_id)));
        setRows(theirs.rows.filter((r) => r.tracks));
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAuthed(false); return; }
      const res = await pageAll<Row>((a, b) => supabase.from("liked_tracks").select("liked_at, tracks(*)").order("liked_at", { ascending: false }).order("track_id").range(a, b));
      if (res.error) setErr(res.error);
      setRows(res.rows.filter((r) => r.tracks));
    })();
  }, []); // eslint-disable-line

  async function unlike(id: string) {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("liked_tracks").delete().match({ user_id: u.user!.id, track_id: id });
    setRows((r) => r && r.filter((x) => x.tracks.id !== id));
    setSel((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  function changeSort(k: SortKey) {
    setSortKey(k);
    setAsc(k === "artist" || k === "title"); // names default A-Z, dates default newest first
  }

  const channels = useMemo(
    () => Array.from(new Set((rows ?? []).filter((r) => !genre || (r.tracks.genre ?? "dnb") === genre).map((r) => r.tracks.source_name).filter(Boolean) as string[])).sort(),
    [rows, genre]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) =>
      (!needle || `${r.tracks.title} ${r.tracks.artist_name}`.toLowerCase().includes(needle)) &&
      (!channel || r.tracks.source_name === channel) &&
      (!genre || (r.tracks.genre ?? "dnb") === genre)
    );
    const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    return list.sort((a, b) => {
      let r = 0;
      if (sortKey === "liked") r = a.liked_at.localeCompare(b.liked_at);
      else if (sortKey === "posted") {
        const x = a.tracks.released_on, y = b.tracks.released_on;
        if (!x && !y) return 0;
        if (!x) return 1; // tracks with no post date always go last
        if (!y) return -1;
        r = x.localeCompare(y);
      }
      else if (sortKey === "artist") r = text(a.tracks.artist_name, b.tracks.artist_name);
      else r = text(a.tracks.title, b.tracks.title);
      return asc ? r : -r;
    });
  }, [rows, q, channel, genre, sortKey, asc]);

  // What is shown is what auto-play follows: filter, search or sort and the next track changes with it.
  const shownTracks = useMemo(() => shown.map((r) => r.tracks), [shown]);
  useEffect(() => { updateQueue(shownTracks, owner); }, [shownTracks, updateQueue]);
  const pdfTracks = useMemo(() => shownTracks.map((t) => ({ artist: t.artist_name, title: t.title })), [shownTracks]);
  usePublishPdf("Likes", pdfTracks); // the Account menu's "Download PDF" exports this list

  function pickGenre(g: Genre) {
    setGenre(g);
    if (channel && !(rows ?? []).some((r) => r.tracks.source_name === channel && (!g || (r.tracks.genre ?? "dnb") === g))) setChannel("");
  }

  const selectedShown = shown.filter((r) => sel.has(r.tracks.id));

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function copyLinks() {
    const text = selectedShown.map((r) => r.tracks.source_url).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    const n = selectedShown.length;
    setCopied(`Copied ${n} link${n === 1 ? "" : "s"}`);
    setTimeout(() => setCopied(""), 2500);
  }

  if (!shared && !authed) return <p>Please <a className="text-[#c6ff00] underline" href="/login">sign in</a> to see your likes.</p>;
  const btn = `border border-white/20 px-3 text-xs uppercase tracking-widest hover:border-white/50 ${m ? "py-2.5" : "py-1.5"}`;
  const field = `border border-white/20 px-3 text-sm ${m ? "w-full py-2.5" : "py-1.5"}`;
  const dirLabel = sortKey === "artist" || sortKey === "title" ? (asc ? "A → Z" : "Z → A") : (asc ? "Oldest first" : "Newest first");
  const showBoxes = !m || selectMode;
  return (
    <>
      <h1 className="mb-4 text-2xl font-black uppercase sm:mb-6 sm:text-3xl">{shared ? "Shared likes" : "Likes"}</h1>
      {shared && (
        <p className="mb-4 text-xs text-white/50">
          Someone shared these likes with you, read-only. You can play them, select tracks and copy their links.{" "}
          {signedIn === false
            ? <>To like a track onto your own account, <a className="text-[#c6ff00] underline" href={`/login?next=${encodeURIComponent(`/shared/${shareCode}`)}`}>sign in</a>.</>
            : "The heart saves a track to your own likes."}
        </p>
      )}

      {m ? (
        <MobileFilters active={(q.trim() ? 1 : 0) + (channel ? 1 : 0) + (genre ? 1 : 0) + (sortKey !== "liked" || asc ? 1 : 0)}
          trailing={<button onClick={() => { if (selectMode) setSel(new Set()); setSelectMode(!selectMode); }} aria-pressed={selectMode}
            className={`${btn} ${selectMode ? "border-[#c6ff00] text-[#c6ff00]" : ""}`}>{selectMode ? "Done" : "Select"}</button>}>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><GenreToggle value={genre} onChange={pickGenre} withBands /></div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search likes" className={`col-span-2 bg-transparent ${field}`} />
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`bg-black ${field}`} aria-label="Channel">
              <option value="">All channels</option>
              {channels.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sortKey} onChange={(e) => changeSort(e.target.value as SortKey)} className={`bg-black ${field}`} aria-label="Sort by">
              {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
            </select>
            <button onClick={() => setAsc(!asc)} className={`col-span-2 ${btn}`}>{dirLabel}</button>
          </div>
        </MobileFilters>
      ) : (
        <div className="mb-3 space-y-3">
          {/* Row 1: genre buttons on the left, Shuffle / Random on the right */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GenreToggle value={genre} onChange={pickGenre} withBands />
            {shown.length > 0 && <PlayActions bare tracks={shownTracks} owner={owner} />}
          </div>
          {/* Row 2: channel, sort and search */}
          <div className="flex flex-wrap items-center gap-3">
            {!searchOpen && (<>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`bg-black ${field}`}>
                <option value="">All channels</option>
                {channels.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={sortKey} onChange={(e) => changeSort(e.target.value as SortKey)} className={`bg-black ${field}`} aria-label="Sort by">
                {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
              </select>
              <button onClick={() => setAsc(!asc)} className={btn}>{dirLabel}</button>
            </>)}
            <div className={`flex items-center ${searchOpen ? "min-w-0 flex-1" : "ml-auto"}`}>
              <CollapsibleSearch value={q} onChange={setQ} placeholder="Search likes" open={searchOpen} onOpenChange={setSearchOpen} />
            </div>
          </div>
        </div>
      )}

      {showBoxes ? (
        <div className={m ? "mb-3 grid grid-cols-2 gap-2" : "mb-4 flex flex-wrap items-center gap-3"}>
          <button onClick={copyLinks} disabled={!selectedShown.length}
            className={`bg-[#c6ff00] px-4 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-30 ${m ? "col-span-2 py-3" : "py-1.5"}`}>
            Copy Links{selectedShown.length ? ` (${selectedShown.length})` : ""}
          </button>
          <button onClick={() => setSel(new Set(shown.map((r) => r.tracks.id)))} disabled={!shown.length} className={btn}>Select all shown</button>
          <button onClick={() => setSel(new Set())} disabled={!sel.size} className={btn}>Clear selection</button>
          {copied && <span className={`text-sm text-[#c6ff00] ${m ? "col-span-2" : ""}`}>{copied}</span>}
        </div>
      ) : null}

      {err && <p className="mb-4 text-red-400">Database error: {err}</p>}
      {rows && !shown.length && <p className="text-white/50">{rows.length ? "No likes match." : shared ? "Nothing here. This link may have been turned off, or nothing is shared yet." : "Nothing here yet."}</p>}
      {m && shown.length > 0 && <PlayActions tracks={shownTracks} owner={owner} />}
      <ul className="divide-y divide-white/10">
        {shown.flatMap((r, i) => {
          const on = sel.has(r.tracks.id);
          // Day dividers only make sense when the list is in date order: by date liked, or by date posted.
          const dayOf = (x: Row) => (sortKey === "liked" ? dayKey(x.liked_at) : sortKey === "posted" ? dayKey(x.tracks.released_on) : null);
          const day = dayOf(r);
          const divider = day && day !== (i ? dayOf(shown[i - 1]) : null) ? [<DayDivider key={`day-${day}-${i}`} day={day} />] : [];
          return [...divider,
            <TrackRow key={r.tracks.id} t={r.tracks} showGenre={!genre} queue={shownTracks} owner={owner} extra={`liked ${new Date(r.liked_at).toLocaleDateString()}`}
              leading={showBoxes ? (
                <button onClick={() => toggle(r.tracks.id)} aria-pressed={on} aria-label={on ? "Deselect track" : "Select track"}
                  className={`shrink-0 border text-sm font-bold leading-none ${m ? "h-8 w-8" : "h-6 w-6"} ${on ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/30"}`}>
                  {on ? "✓" : ""}
                </button>
              ) : undefined}
              action={shared
                ? <LikeButton key={r.tracks.id + viewerLiked.has(r.tracks.id)} trackId={r.tracks.id} initiallyLiked={viewerLiked.has(r.tracks.id)} className={m ? "flex h-11 w-11 items-center justify-center text-2xl" : ""} />
                : <button onClick={() => unlike(r.tracks.id)} className={`text-[#c6ff00] ${m ? "flex h-11 w-11 items-center justify-center text-2xl" : ""}`} aria-label="Unlike">♥</button>} />];
        })}
      </ul>
    </>
  );
}
