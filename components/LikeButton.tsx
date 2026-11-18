"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export function LikeButton({ trackId, initiallyLiked }: { trackId: string; initiallyLiked: boolean }) {
  const [liked, setLiked] = useState(initiallyLiked);
  const supabase = createClient();

  async function toggle() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return (window.location.href = "/login");
    const next = !liked;
    setLiked(next); // optimistic
    const { error } = next
      ? await supabase.from("liked_tracks").insert({ user_id: user.id, track_id: trackId }) // liked_at defaults to now()
      : await supabase.from("liked_tracks").delete().match({ user_id: user.id, track_id: trackId });
    if (error && error.code !== "23505") setLiked(!next); // 23505 = already liked, fine
  }
  return (
    <button onClick={toggle} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}
      className={liked ? "text-[#c6ff00]" : "text-white/50 hover:text-white"}>
      {liked ? "♥" : "♡"}
    </button>
  );
}
