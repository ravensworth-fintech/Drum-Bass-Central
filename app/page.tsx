import { db } from "@/lib/supabase-server";
import { TrackList, Track } from "@/components/TrackList";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Discover() {
  let tracks: Track[] = [], error = "";
  try {
    const { data, error: e } = await db().from("tracks").select("*").order("released_on", { ascending: false, nullsFirst: false }).limit(30);
    if (e) error = e.message; else tracks = (data ?? []) as Track[];
  } catch (e) { error = String(e); }
  return (
    <>
      <h1 className="mb-6 text-3xl font-black uppercase">Fresh D&amp;B</h1>
      {error && <p className="mb-4 text-red-400">Database error: {error}</p>}
      <TrackList tracks={tracks} title="Fresh D&B" />
    </>
  );
}
