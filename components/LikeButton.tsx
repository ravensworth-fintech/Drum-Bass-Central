"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export function LikeButton({ trackId, initiallyLiked, className = "" }: { trackId: string; initiallyLiked: boolean; className?: string }) {
  const [liked, setLiked] = useState(initiallyLiked);

  // Other hearts for the same track (e.g. the one in the bottom player) tell this one when they change.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ trackId: string; liked: boolean }>).detail;
      if (d.trackId === trackId) setLiked(d.liked);
    };
    window.addEventListener("track-like-changed", on);
    return () => window.removeEventListener("track-like-changed", on);
  }, [trackId]);

  async function toggle() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return (window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`); // sign in, then come straight back here
    const next = !liked;
    setLiked(next); // optimistic
    const { error } = next
      ? await supabase.from("liked_tracks").insert({ user_id: user.id, track_id: trackId }) // liked_at defaults to now()
      : await supabase.from("liked_tracks").delete().match({ user_id: user.id, track_id: trackId });
    if (error && error.code !== "23505") { setLiked(!next); alert(`Could not save your like: ${error.message}`); return; } // 23505 = already liked, fine
    window.dispatchEvent(new CustomEvent("track-like-changed", { detail: { trackId, liked: next } }));
  }
  return (
    <button onClick={toggle} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}
      className={`${liked ? "text-[#c6ff00]" : "text-white/50 hover:text-white"} ${className}`}>
      {liked ? "♥" : "♡"}
    </button>
  );
}
