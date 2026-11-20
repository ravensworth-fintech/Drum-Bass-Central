"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LikeButton } from "./LikeButton";
import { DownloadPdfButton } from "./DownloadPdfButton";
import { isPlayable, usePlayer } from "./PlayerProvider";
import { useIsMobile } from "./DeviceProvider";
import { QueueIcon } from "./QueueIcon";

export type Track = {
  id: string; title: string; artist_name: string; subgenre: string;
  artwork_url: string | null; source_url: string; embed_url: string | null; released_on: string | null; source_name: string | null;
  duration_seconds?: number | null; genre?: string; kind?: "mix";
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(s: string | null): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const base = `${Number(m[3])} ${MON[Number(m[2]) - 1]}`;
  return Number(m[1]) === new Date().getFullYear() ? base : `${base} ${m[1]}`;
}

export function fmtDur(sec: number | null | undefined): string | null {
  if (!sec || sec < 1) return null;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), r = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** "2026-11-17..." -> "2026-11-17", or null when there is no usable date. */
export const dayKey = (s: string | null | undefined): string | null => s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d} ${MON[m - 1]}${y === new Date().getFullYear() ? "" : ` ${y}`}`;
}

/** A thin labelled line between one day's songs and the next day's. Put it inside a <ul className="divide-y ...">. */
export function DayDivider({ day }: { day: string }) {
  return (
    <li role="presentation" className="flex items-center gap-3 pb-1 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/40 !border-t-0 [&+li]:!border-t-0">
      <span>{dayLabel(day)}</span>
      <span className="h-px flex-1 bg-white/15" />
    </li>
  );
}

/** Opens SoundCloud's own search page. No API key needed. */
export const scSearchUrl = (q: string) => `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`;

const chip = "shrink-0 border border-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:border-[#c6ff00] hover:text-[#c6ff00]";

export const genreLabel = (g?: string) => (g === "house" ? "House" : g === "dubstep" ? "Dubstep" : g === "bands" ? "Bands" : "D&B");
/** Faint row tint used on Fresh Fire so the genres are easy to tell apart. */
const genreTint = (g?: string) => (g === "house" ? "bg-indigo-300/[0.07]" : g === "dubstep" ? "bg-fuchsia-300/[0.07]" : "");

export function TrackRow({ t, leading, extra, action, queue, below, noSC, showGenre, tintHouse }: {
  t: Track; leading?: React.ReactNode; extra?: string; action: React.ReactNode; queue: Track[]; below?: React.ReactNode; noSC?: boolean; showGenre?: boolean; tintHouse?: boolean;
}) {
  const { current, playing, play, toggle, addToQueue } = usePlayer();
  const mobile = useIsMobile();
  const isCur = current?.id === t.id;
  const [added, setAdded] = useState(false); // brief checkmark after adding to Up Next
  useEffect(() => { if (!added) return; const id = setTimeout(() => setAdded(false), 1200); return () => clearTimeout(id); }, [added]);
  const queueBtn = isPlayable(t) ? (
    <button onClick={() => { addToQueue(t); setAdded(true); }} aria-label="Add to Up Next" title="Add to Up Next"
      className={mobile
        ? `flex h-11 w-10 shrink-0 items-center justify-center ${added ? "text-[#c6ff00]" : "text-white/60"}`
        : `${chip} ${added ? "!border-[#c6ff00] !text-[#c6ff00]" : ""}`}>
      {mobile ? (added ? "✓" : <QueueIcon />) : added ? "✓ Added" : "+ Next"}
    </button>
  ) : null;
  const li = useRef<HTMLLIElement>(null);
  useEffect(() => { if (isCur) li.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [isCur]);
  const meta = [showGenre ? genreLabel(t.genre) : null, fmtDur(t.duration_seconds), t.subgenre !== "Unknown" ? t.subgenre : null, t.source_name, fmtDate(t.released_on), extra].filter(Boolean).join(" · ");
  // Mobile row: big play/artwork target on the left, title / artist / details stacked, one action (the heart) on the right. No tiny link chips.
  if (mobile) return (
    <li ref={li} className={`py-2.5 ${isCur ? "bg-white/5" : tintHouse ? genreTint(t.genre) : ""}`}>
      <div className="flex items-center gap-3">
        {leading}
        <button onClick={() => (isCur ? toggle() : play(t, queue))} disabled={!isPlayable(t)} aria-label={isCur && playing ? "Pause" : "Play"}
          className="relative h-14 w-14 shrink-0 overflow-hidden bg-white/10">
          {t.artwork_url && <img src={t.artwork_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          {isPlayable(t) && <span className={`absolute inset-0 flex items-center justify-center text-base ${isCur ? "bg-black/60 text-[#c6ff00]" : "bg-black/40"}`}>{isCur && playing ? "❚❚" : "▶"}</span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[15px] font-semibold ${isCur ? "text-[#c6ff00]" : ""}`}>{t.title}</div>
          <div className="truncate text-sm text-white/60">{t.artist_name}</div>
          <div className="truncate text-xs text-white/40">{meta}</div>
        </div>
        {queueBtn}
        {action}
      </div>
      {below}
    </li>
  );
  return (
    <li ref={li} className={`py-2 ${isCur ? "bg-white/5" : tintHouse ? genreTint(t.genre) : ""}`}>
      <div className="flex items-center gap-3">
        {leading}
        <button onClick={() => (isCur ? toggle() : play(t, queue))} disabled={!isPlayable(t)} aria-label={isCur && playing ? "Pause" : "Play"}
          className="group relative h-11 w-11 shrink-0 overflow-hidden bg-white/10">
          {t.artwork_url && <img src={t.artwork_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          {isPlayable(t) && (
            <span className={`absolute inset-0 flex items-center justify-center text-sm group-hover:bg-black/60 group-hover:text-[#c6ff00] ${isCur ? "bg-black/60 text-[#c6ff00]" : "bg-black/40"}`}>{isCur && playing ? "❚❚" : "▶"}</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm"><span className={`font-semibold ${isCur ? "text-[#c6ff00]" : ""}`}>{t.title}</span><span className="text-white/60"> – {t.artist_name}</span></div>
          <div className="truncate text-xs text-white/40 md:hidden">{meta}</div>
        </div>
        <span className="hidden max-w-[22rem] shrink-0 truncate text-xs text-white/40 md:block">{meta}</span>
        {!noSC && <a href={scSearchUrl(`${t.artist_name} ${t.title}`)} target="_blank" rel="noreferrer" title="Search on SoundCloud" className={chip}>SC</a>}
        <a href={t.source_url} target="_blank" rel="noreferrer" title="Open original" className={chip}>{t.source_url.includes("youtube") ? "YT" : "↗"}</a>
        {queueBtn}
        {action}
      </div>
      {below}
    </li>
  );
}

export function TrackList({ tracks, title, showGenre, tintHouse }: { tracks: Track[]; title: string; showGenre?: boolean; tintHouse?: boolean }) {
  const mobile = useIsMobile();
  const [liked, setLiked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await s.from("liked_tracks").select("track_id");
      setLiked(new Set((rows ?? []).map((r) => r.track_id)));
    });
  }, []);

  if (!tracks.length)
    return <p className="text-white/50">No tracks yet. They appear here once the ingestion engine has scanned sources.</p>;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <DownloadPdfButton title={title} tracks={tracks.map((t) => ({ artist: t.artist_name, title: t.title }))} />
      </div>
      <ul className="divide-y divide-white/10">
        {tracks.flatMap((t, i) => {
          const day = dayKey(t.released_on);
          const rows: React.ReactNode[] = [];
          if (day && day !== (i ? dayKey(tracks[i - 1].released_on) : null)) rows.push(<DayDivider key={`day-${day}-${i}`} day={day} />);
          rows.push(
            <TrackRow key={t.id} t={t} queue={tracks} showGenre={showGenre} tintHouse={tintHouse}
              action={<LikeButton key={t.id + liked.has(t.id)} trackId={t.id} initiallyLiked={liked.has(t.id)} className={mobile ? "flex h-11 w-11 items-center justify-center text-2xl" : ""} />} />
          );
          return rows;
        })}
      </ul>
    </div>
  );
}
