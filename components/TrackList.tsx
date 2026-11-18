"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LikeButton } from "./LikeButton";
import { DownloadPdfButton } from "./DownloadPdfButton";
import { isYT, usePlayer } from "./PlayerProvider";

export type Track = {
  id: string; title: string; artist_name: string; subgenre: string;
  artwork_url: string | null; source_url: string; embed_url: string | null; released_on: string | null; source_name: string | null;
  duration_seconds?: number | null;
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

/** Opens SoundCloud's own search page. No API key needed. */
export const scSearchUrl = (q: string) => `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`;

const chip = "shrink-0 border border-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:border-[#c6ff00] hover:text-[#c6ff00]";

export function TrackRow({ t, leading, extra, action, queue, below, noSC }: {
  t: Track; leading?: React.ReactNode; extra?: string; action: React.ReactNode; queue: Track[]; below?: React.ReactNode; noSC?: boolean;
}) {
  const { current, playing, play, toggle } = usePlayer();
  const isCur = current?.id === t.id;
  const li = useRef<HTMLLIElement>(null);
  useEffect(() => { if (isCur) li.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [isCur]);
  const meta = [fmtDur(t.duration_seconds), t.subgenre !== "Unknown" ? t.subgenre : null, t.source_name, fmtDate(t.released_on), extra].filter(Boolean).join(" · ");
  return (
    <li ref={li} className={`py-2 ${isCur ? "bg-white/5" : ""}`}>
      <div className="flex items-center gap-3">
        {leading}
        <button onClick={() => (isCur ? toggle() : play(t, queue))} disabled={!isYT(t)} aria-label={isCur && playing ? "Pause" : "Play"}
          className="group relative h-11 w-11 shrink-0 overflow-hidden bg-white/10">
          {t.artwork_url && <img src={t.artwork_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          {isYT(t) && (
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
        {action}
      </div>
      {below}
    </li>
  );
}

export function TrackList({ tracks, title }: { tracks: Track[]; title: string }) {
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
        {tracks.map((t) => (
          <TrackRow key={t.id} t={t} queue={tracks}
            action={<LikeButton key={t.id + liked.has(t.id)} trackId={t.id} initiallyLiked={liked.has(t.id)} />} />
        ))}
      </ul>
    </div>
  );
}
