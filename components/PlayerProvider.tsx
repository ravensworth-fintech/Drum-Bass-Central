"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "./TrackList";
import { LikeButton } from "./LikeButton";
import { createClient } from "@/lib/supabase-browser";
import { toggleLikeById } from "@/lib/likes";
import { useIsMobile } from "./DeviceProvider";
import { QueueIcon } from "./QueueIcon";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ONE persistent YouTube player (official IFrame API) that lives in the layout. Because the same player keeps
// running and just loads the next video, browsers let playback continue to the next track while the tab is in the background.
type Ctx = { current: Track | null; playing: boolean; play: (t: Track, queue: Track[], owner?: string) => void; toggle: () => void; addToQueue: (t: Track) => void; updateQueue: (list: Track[], owner: string) => void };
const PlayerCtx = createContext<Ctx>({ current: null, playing: false, play: () => {}, toggle: () => {}, addToQueue: () => {}, updateQueue: () => {} });
export const usePlayer = () => useContext(PlayerCtx);

export const isYT = (t: Track) => !!t.embed_url?.includes("youtube.com/embed/");
const vidOf = (t: Track) => t.embed_url!.split("/embed/")[1].split(/[?&#]/)[0];
// SoundCloud tracks play through SoundCloud's official Widget API (a second, hidden player). YouTube keeps its own player.
export const isSC = (t: Track) => !!t.embed_url?.includes("w.soundcloud.com/player");
export const isPlayable = (t: Track) => isYT(t) || isSC(t);

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

let scReadyP: Promise<any> | null = null;
function loadSC(): Promise<any> {
  if (scReadyP) return scReadyP;
  scReadyP = new Promise((resolve) => {
    const w = window as any;
    if (w.SC?.Widget) return resolve(w.SC);
    const s = document.createElement("script");
    s.src = "https://w.soundcloud.com/player/api.js";
    s.onload = () => resolve(w.SC);
    document.head.appendChild(s);
  });
  return scReadyP;
}
const SC_OPTS = { auto_play: true, hide_related: true, show_comments: false, show_user: false, show_reposts: false, visual: false };

const fmt = (n: number) => {
  const s = Math.max(0, Math.floor(n || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

/** Seek bar outside the YouTube player. Reads position from the official player and seeks with seekTo(). */
function Progress({ getPlayer, compact }: { getPlayer: () => any; compact?: boolean }) {
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const p = getPlayer();
      if (!p?.getCurrentTime) return;
      setTime(p.getCurrentTime() || 0);
      setDur(p.getDuration() || 0);
    }, 250);
    return () => clearInterval(id);
  }, [getPlayer]);
  const commit = () => {
    if (drag === null) return;
    getPlayer()?.seekTo(drag, true);
    setTime(drag);
    setDrag(null);
  };
  const shown = drag ?? time;
  return (
    <div className={`flex items-center gap-3 text-xs tabular-nums text-white/60 ${compact ? "pt-1" : "pt-2"}`}>
      {!compact && <span className="w-10 text-right">{fmt(shown)}</span>}
      <input type="range" min={0} max={dur || 1} step={1} value={Math.min(shown, dur || 1)} disabled={!dur} aria-label="Seek"
        onChange={(e) => setDrag(Number(e.target.value))} onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}
        className="h-6 flex-1 cursor-pointer accent-[#c6ff00] disabled:cursor-default" />
      {!compact && <span className="w-10">{fmt(dur)}</span>}
    </div>
  );
}

/** Heart for the track in the player. Looks up whether the signed-in user already liked it. Mixes can't be liked. */
function PlayerLike({ trackId }: { trackId: string }) {
  const [liked, setLiked] = useState<boolean | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return !dead && setLiked(false);
      const { data } = await sb.from("liked_tracks").select("track_id").eq("track_id", trackId).maybeSingle();
      if (!dead) setLiked(!!data);
    })();
    return () => { dead = true; };
  }, [trackId]);
  if (liked === null) return <span className="w-10" />;
  return <LikeButton key={trackId + liked} trackId={trackId} initiallyLiked={liked} className="flex h-12 w-10 items-center justify-center text-3xl" />;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const mobile = useIsMobile();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const ready = useRef(false);
  const queue = useRef<Track[]>([]);
  const cur = useRef<Track | null>(null);
  const stepRef = useRef<(d: 1 | -1) => void>(() => {});
  // "Up Next": songs the person queued. They play first, in the order added; when it empties, playback resumes in the list
  // after `anchor` (the last song that came from a list rather than from Up Next).
  const upNextRef = useRef<Track[]>([]);
  const anchor = useRef<Track | null>(null);
  const atStart = useRef(false); // true when the playing song was filtered out and the next one is the first visible track
  const queueOwner = useRef<string | null>(null); // which on-screen list the playing queue came from
  const [upNext, setUpNext] = useState<Track[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const setQueueList = useCallback((l: Track[]) => { upNextRef.current = l; setUpNext(l); }, []);
  const engine = useRef<"yt" | "sc">("yt");
  const scHost = useRef<HTMLDivElement>(null);
  const scw = useRef<any>(null);
  const scReady = useRef(false);
  const scTime = useRef({ pos: 0, dur: 0 });
  const scAdapter = useMemo(() => ({
    getCurrentTime: () => scTime.current.pos,
    getDuration: () => scTime.current.dur,
    seekTo: (s: number) => { scw.current?.seekTo(s * 1000); scTime.current.pos = s; },
  }), []);

  const loadSCTrack = useCallback((t: Track) => {
    scTime.current = { pos: 0, dur: t.duration_seconds ?? 0 };
    if (scw.current && scReady.current) { scw.current.load(t.source_url, { ...SC_OPTS, callback: () => scw.current.play() }); return; }
    if (scw.current) return; // still starting up: READY loads whatever is current
    loadSC().then((SC) => {
      if (scw.current || !scHost.current) return;
      const iframe = document.createElement("iframe");
      iframe.allow = "autoplay"; iframe.width = "300"; iframe.height = "100"; iframe.title = "SoundCloud player";
      iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(t.source_url)}&auto_play=true&hide_related=true&show_comments=false&visual=false`;
      scHost.current.appendChild(iframe);
      const w = SC.Widget(iframe);
      scw.current = w;
      const sync = () => w.getDuration((ms: number) => { if (ms) scTime.current.dur = ms / 1000; });
      w.bind(SC.Widget.Events.READY, () => {
        scReady.current = true; sync();
        const c = cur.current;
        if (c && isSC(c) && c.source_url !== t.source_url) w.load(c.source_url, { ...SC_OPTS, callback: () => w.play() }); else w.play();
      });
      w.bind(SC.Widget.Events.PLAY, () => { if (engine.current === "sc") { setPlaying(true); sync(); } });
      w.bind(SC.Widget.Events.PAUSE, () => { if (engine.current === "sc") setPlaying(false); });
      w.bind(SC.Widget.Events.FINISH, () => { if (engine.current === "sc") stepRef.current(1); });
      w.bind(SC.Widget.Events.PLAY_PROGRESS, (e: any) => { scTime.current.pos = (e?.currentPosition ?? 0) / 1000; });
      w.bind(SC.Widget.Events.ERROR, () => { if (engine.current === "sc") stepRef.current(1); });
    });
  }, []);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);

  const load = useCallback((t: Track) => {
    cur.current = t;
    setCurrent(t);
    if (isSC(t)) {
      engine.current = "sc";
      try { if (ready.current) player.current.pauseVideo(); } catch { /* ignore */ }
      loadSCTrack(t);
      return;
    }
    engine.current = "yt";
    try { scw.current?.pause(); } catch { /* ignore */ }
    if (ready.current) { player.current.loadVideoById(vidOf(t)); return; }
    if (player.current) return; // still starting up: onReady loads cur.current
    loadYT().then((YT) => {
      if (player.current || !host.current) return;
      const el = document.createElement("div");
      host.current.appendChild(el);
      player.current = new YT.Player(el, {
        width: "100%", height: "100%",
        playerVars: { rel: 0, playsinline: 1, controls: 0, origin: window.location.origin }, // controls: 0 = our own bar below handles seeking
        events: {
          onReady: () => { ready.current = true; if (cur.current) player.current.loadVideoById(vidOf(cur.current)); },
          onStateChange: (e: any) => {
            if (engine.current !== "yt") return;
            if (e.data === 0) stepRef.current(1); // ended -> next track
            else if (e.data === 1) setPlaying(true);
            else if (e.data === 2) setPlaying(false);
          },
          onError: () => { if (engine.current === "yt") stepRef.current(1); }, // embedding blocked -> skip
        },
      });
    });
  }, [loadSCTrack]);

  stepRef.current = (d) => {
    if (d === 1 && upNextRef.current.length) { // something is queued: play it before returning to the list
      const [n, ...rest] = upNextRef.current;
      setQueueList(rest);
      load(n);
      return;
    }
    const q = queue.current;
    const a = anchor.current ?? (atStart.current ? null : cur.current);
    if (d === -1 && a && cur.current && cur.current.id !== a.id) { load(a); return; } // "previous" from a queued song goes back to where the list was left
    const i = q.findIndex((x) => x.id === a?.id);
    const next = d === 1 ? q.slice(i + 1).find(isPlayable) : q.slice(0, Math.max(i, 0)).reverse().find(isPlayable);
    if (next) { anchor.current = next; atStart.current = false; load(next); } else if (d === 1) setPlaying(false);
  };

  const play = useCallback((t: Track, list: Track[], owner?: string) => { queue.current = list; queueOwner.current = owner ?? null; anchor.current = t; atStart.current = false; load(t); }, [load]);
  // The list the person is playing from changed on screen (genre buttons, search, sort, load more): auto-play follows the visible tracks.
  // If the playing song was filtered out, playback continues with the first visible track that came after it.
  const updateQueue = useCallback((list: Track[], owner: string) => {
    if (queueOwner.current !== owner || !cur.current) return;
    const old = queue.current;
    queue.current = list;
    if (atStart.current) return; // already waiting to start from the top of the visible list
    const a = anchor.current ?? cur.current;
    if (list.some((x) => x.id === a.id)) return;
    const visible = new Set(list.map((x) => x.id));
    const oi = old.findIndex((x) => x.id === a.id);
    const next = oi >= 0 ? old.slice(oi + 1).find((x) => visible.has(x.id)) : undefined;
    if (!next) { anchor.current = list[list.length - 1] ?? null; return; } // nothing visible after it: the list ends here
    const ni = list.findIndex((x) => x.id === next.id);
    anchor.current = ni > 0 ? list[ni - 1] : null; // so "next" lands on `next`
    atStart.current = ni === 0;
  }, []);
  const addToQueue = useCallback((t: Track) => {
    if (!isPlayable(t)) return;
    if (!cur.current) { queue.current = [t]; queueOwner.current = null; anchor.current = t; atStart.current = false; load(t); return; } // nothing playing yet: just play it
    setQueueList([...upNextRef.current, t]);
  }, [load, setQueueList]);
  const toggle = useCallback(() => {
    if (engine.current === "sc") { scw.current?.toggle(); return; }
    const p = player.current;
    if (!ready.current) return;
    if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
  }, []);
  const close = () => {
    if (ready.current) player.current.stopVideo();
    try { scw.current?.pause(); } catch { /* ignore */ }
    cur.current = null; anchor.current = null; atStart.current = false; setQueueList([]); setShowQueue(false); setCurrent(null); setPlaying(false);
  };

  const ctx = useMemo(() => ({ current, playing, play, toggle, addToQueue, updateQueue }), [current, playing, play, toggle, addToQueue, updateQueue]);
  const getPlayer = useCallback(() => (engine.current === "sc" ? (scReady.current ? scAdapter : null) : ready.current ? player.current : null), [scAdapter]);
  // Keyboard shortcuts on every page: Space = play/pause, L = like, ←/→ = back/forward 5 seconds.
  useEffect(() => {
    const SEEK = 5;
    const isTyping = (el: EventTarget | null) => {
      const e = el as HTMLElement | null;
      if (!e) return false;
      if (e.isContentEditable) return true;
      const tag = e.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") return !["range", "button", "submit", "reset"].includes((e as HTMLInputElement).type);
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const t = cur.current;
      if (!t) return; // nothing loaded: leave keys alone (space still scrolls the page)
      if (e.code === "Space") {
        e.preventDefault(); // also stops a focused button from being "clicked" by the space bar
        if (!e.repeat) toggle();
      } else if (e.key === "l" || e.key === "L") {
        if (e.repeat || t.kind === "mix") return; // mixes can't be liked
        toggleLikeById(t.id);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return; // let the seek slider handle its own arrows
        const p = getPlayer();
        if (!p) return;
        e.preventDefault();
        const dur = p.getDuration?.() || 0;
        const to = (p.getCurrentTime?.() || 0) + (e.key === "ArrowRight" ? SEEK : -SEEK);
        p.seekTo(dur ? Math.min(Math.max(0, to), Math.max(0, dur - 1)) : Math.max(0, to), true);
      }
    };
    // Firefox fires the button click on space *keyup*, so block that too while a track is loaded.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && cur.current && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [toggle, getPlayer]);
  const skip = mobile ? "flex h-10 w-10 items-center justify-center text-xl text-white/80" : "flex h-12 w-12 items-center justify-center text-2xl text-white/80 hover:text-[#c6ff00]";
  // The player is ONE set of elements in both layouts (only classes change), so the YouTube/SoundCloud player never restarts when the layout switches.
  return (
    <PlayerCtx.Provider value={ctx}>
      {children}
      <div ref={scHost} aria-hidden className="pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0" /> {/* hidden SoundCloud player */}
      {current && <div className={mobile ? "h-24" : "h-36"} />} {/* keeps the last rows clear of the bar */}
      <div className={`fixed inset-x-0 z-50 border-t border-white/15 ${mobile ? "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] bg-black" : "bottom-0 bg-black/95 backdrop-blur"} ${current ? "" : "hidden"}`}>
        {showQueue && current && (
          <div className="absolute inset-x-0 bottom-full max-h-[50vh] overflow-y-auto border-t border-white/15 bg-black/95 backdrop-blur">
            <div className="mx-auto max-w-5xl px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-white/70">Up Next{upNext.length ? ` · ${upNext.length}` : ""}</span>
                <span className="flex items-center gap-4">
                  {upNext.length > 0 && <button onClick={() => setQueueList([])} className="text-white/50 hover:text-white">Clear</button>}
                  <button onClick={() => setShowQueue(false)} aria-label="Close Up Next" className="text-white/50 hover:text-white">✕</button>
                </span>
              </div>
              {upNext.length ? (
                <ol className="divide-y divide-white/10">
                  {upNext.map((q, i) => (
                    <li key={`${q.id}-${i}`} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/40">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{q.title}</span><span className="text-white/60"> – {q.artist_name}</span></span>
                      <button onClick={() => setQueueList(upNextRef.current.filter((_, k) => k !== i))} aria-label={`Remove ${q.title} from Up Next`} className="px-2 text-white/40 hover:text-white">✕</button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-white/50">Nothing queued. Tap “+ Next” on any song to add it here.</p>
              )}
            </div>
          </div>
        )}
        <div className="mx-auto max-w-5xl px-4">
        <Progress key={current?.id} getPlayer={getPlayer} compact={mobile} />
        <div className={`flex items-center ${mobile ? "gap-2 pb-2 pt-1" : "gap-3 py-2 sm:gap-5"}`}>
          <div className={`relative aspect-video shrink-0 bg-black ${mobile ? "w-[72px]" : "w-28 sm:w-44"}`}><div ref={host} className="absolute inset-0" />{current && isSC(current) && <div className="absolute inset-0 bg-black">{current.artwork_url && <img src={current.artwork_url} alt="" className="h-full w-full object-cover" />}</div>}</div>
          <div className="min-w-0 flex-1">
            <div className={`truncate font-semibold ${mobile ? "text-sm" : "text-sm sm:text-base"}`}>{current?.title}</div>
            <div className={`truncate text-white/60 ${mobile ? "text-xs" : "text-xs sm:text-sm"}`}>{current?.artist_name}</div>
          </div>
          {!mobile && <button onClick={() => stepRef.current(-1)} aria-label="Previous track" className={skip}>⏮</button>}
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}
            className={`flex shrink-0 items-center justify-center bg-[#c6ff00] text-black hover:bg-white ${mobile ? "h-11 w-11 text-xl" : "h-14 w-14 text-2xl"}`}>{playing ? "⏸" : "▶"}</button>
          <button onClick={() => stepRef.current(1)} aria-label="Next track" className={skip}>⏭</button>
          <button onClick={() => setShowQueue((v) => !v)} aria-label="Up Next" aria-expanded={showQueue} title="Up Next"
            className={`relative flex shrink-0 items-center justify-center ${showQueue || upNext.length ? "text-[#c6ff00]" : "text-white/60 hover:text-white"} ${mobile ? "h-10 w-9" : "h-12 w-12"}`}>
            <QueueIcon className={mobile ? "h-5 w-5" : "h-6 w-6"} />
            {upNext.length > 0 && <span className="absolute right-0 top-1 min-w-[1rem] bg-[#c6ff00] px-1 text-center text-[10px] font-bold leading-4 text-black">{upNext.length}</span>}
          </button>
          {current && current.kind !== "mix" && <PlayerLike key={current.id} trackId={current.id} />}
          <button onClick={close} aria-label="Close player" className={`text-white/40 hover:text-white ${mobile ? "px-1 text-base" : "ml-1 px-2 text-lg"}`}>✕</button>
        </div>
        </div>
      </div>
    </PlayerCtx.Provider>
  );
}
