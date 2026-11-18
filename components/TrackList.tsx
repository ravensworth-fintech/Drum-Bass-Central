"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LikeButton } from "./LikeButton";
import { DownloadPdfButton } from "./DownloadPdfButton";

export type Track = {
  id: string; title: string; artist_name: string; subgenre: string;
  artwork_url: string | null; source_url: string; embed_url: string | null; released_on: string | null; source_name: string | null;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(s: string | null): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const base = `${Number(m[3])} ${MON[Number(m[2]) - 1]}`;
  return Number(m[1]) === new Date().getFullYear() ? base : `${base} ${m[1]}`;
}

/** Opens SoundCloud's own search page. No API key needed. */
export const scSearchUrl = (q: string) => `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`;

const chip = "shrink-0 border border-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:border-[#c6ff00] hover:text-[#c6ff00]";

/** Id of the next track after `id` that has a player, or null at the end of the list. */
export function nextPlayable(list: Track[], id: string): string | null {
  const i = list.findIndex((t) => t.id === id);
  return list.slice(i + 1).find((t) => t.embed_url)?.id ?? null;
}

// YouTube's official IFrame Player API, loaded once. It reports when a video ends or can't be embedded.
/* eslint-disable @typescript-eslint/no-explicit-any */
let ytReady: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    const w = window as any;
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytReady;
}

function Embed({ t, onEnded }: { t: Track; onEnded: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef(onEnded);
  cb.current = onEnded;
  const isYT = !!t.embed_url?.includes("youtube.com/embed/");
  useEffect(() => {
    if (!isYT) return;
    let dead = false;
    loadYT().then((YT) => {
      if (dead || !ref.current) return;
      new YT.Player(ref.current, {
        events: {
          onStateChange: (e: any) => { if (e.data === 0) cb.current(); }, // 0 = ended -> play the next track
          onError: () => cb.current(),                                    // embedding blocked -> skip to the next track
        },
      });
    });
    return () => { dead = true; };
  }, [t.id, isYT]);
  const base = t.embed_url!;
  const q = `autoplay=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`;
  return (
    <iframe ref={ref} src={`${base}${base.includes("?") ? "&" : "?"}${isYT ? q : "autoplay=1"}`} title={`${t.artist_name} - ${t.title}`}
      className="mt-2 aspect-video w-full max-w-md border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
  );
}

export function TrackRow({ t, leading, extra, action, open, onToggle, onEnded }: {
  t: Track; leading?: React.ReactNode; extra?: string; action: React.ReactNode;
  open: boolean; onToggle: () => void; onEnded: () => void;
}) {
  const li = useRef<HTMLLIElement>(null);
  useEffect(() => { if (open) li.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [open]);
  const meta = [t.subgenre !== "Unknown" ? t.subgenre : null, t.source_name, fmtDate(t.released_on), extra].filter(Boolean).join(" · ");
  return (
    <li ref={li} className="py-2">
      <div className="flex items-center gap-3">
        {leading}
        <button onClick={() => t.embed_url && onToggle()} disabled={!t.embed_url} aria-label={open ? "Close player" : "Play"}
          className="group relative h-11 w-11 shrink-0 overflow-hidden bg-white/10">
          {t.artwork_url && <img src={t.artwork_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          {t.embed_url && (
            <span className={`absolute inset-0 flex items-center justify-center text-sm group-hover:bg-black/60 group-hover:text-[#c6ff00] ${open ? "bg-black/60 text-[#c6ff00]" : "bg-black/40"}`}>{open ? "✕" : "▶"}</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm"><span className="font-semibold">{t.title}</span><span className="text-white/60"> – {t.artist_name}</span></div>
          <div className="truncate text-xs text-white/40 md:hidden">{meta}</div>
        </div>
        <span className="hidden max-w-[22rem] shrink-0 truncate text-xs text-white/40 md:block">{meta}</span>
        <a href={scSearchUrl(`${t.artist_name} ${t.title}`)} target="_blank" rel="noreferrer" title="Search on SoundCloud" className={chip}>SC</a>
        <a href={t.source_url} target="_blank" rel="noreferrer" title="Open original" className={chip}>{t.source_url.includes("youtube") ? "YT" : "↗"}</a>
        {action}
      </div>
      {open && t.embed_url && <Embed key={t.id} t={t} onEnded={onEnded} />}
    </li>
  );
}

export function TrackList({ tracks, title }: { tracks: Track[]; title: string }) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null); // one player open at a time; when it ends the next track opens
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
          <TrackRow key={t.id} t={t} open={playing === t.id}
            onToggle={() => setPlaying(playing === t.id ? null : t.id)}
            onEnded={() => setPlaying(nextPlayable(tracks, t.id))}
            action={<LikeButton key={t.id + liked.has(t.id)} trackId={t.id} initiallyLiked={liked.has(t.id)} />} />
        ))}
      </ul>
    </div>
  );
}
