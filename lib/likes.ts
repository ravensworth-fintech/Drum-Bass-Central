import { createClient } from "@/lib/supabase-browser";

let busy = false;

/** Toggles the signed-in user's like for a track (used by the "L" keyboard shortcut). Checks the database for the
 *  current state, flips it, then broadcasts "track-like-changed" so every heart for that track updates itself.
 *  Does nothing if nobody is signed in (no redirect, so the music keeps playing). */
export async function toggleLikeById(trackId: string): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: existing } = await supabase.from("liked_tracks").select("track_id").eq("user_id", user.id).eq("track_id", trackId).maybeSingle();
    const next = !existing;
    const { error } = next
      ? await supabase.from("liked_tracks").insert({ user_id: user.id, track_id: trackId })
      : await supabase.from("liked_tracks").delete().match({ user_id: user.id, track_id: trackId });
    if (error && error.code !== "23505") return;
    window.dispatchEvent(new CustomEvent("track-like-changed", { detail: { trackId, liked: next } }));
  } finally {
    busy = false;
  }
}
