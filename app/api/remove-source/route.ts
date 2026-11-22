import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { nameKeyOf } from "@/lib/discover";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Powers the Remove button on the Dashboard. Body: { id, hideTracks?: boolean }. Admin only.
 * Stops following the channel (its row in `sources` is deleted, along with its scan log). Tracks and mixes already on the site stay,
 * unless hideTracks is true: then every track and mix from that channel is set to `rejected`, which hides it (nothing is deleted).
 * The channel is also remembered so Discover never suggests it again.
 */
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return fail(a.error, a.status);
  let body: { id?: string; hideTracks?: boolean };
  try { body = await req.json(); } catch { return fail("Bad request."); }
  if (!body.id) return fail("Bad request.");
  const sb = a.sb;

  const { data: src } = await sb.from("sources").select("id,name,url,platform_id,genre").eq("id", body.id).maybeSingle();
  if (!src) return fail("That channel is already gone. Refresh the list.", 404);

  let hiddenTracks = 0, hiddenMixes = 0;
  if (body.hideTracks) {
    const t = await sb.from("tracks").update({ status: "rejected" }).eq("source_name", src.name).neq("status", "rejected").select("id");
    if (t.error) return fail(t.error.message, 500);
    const m = await sb.from("mixes").update({ status: "rejected" }).eq("show_or_channel", src.name).neq("status", "rejected").select("id");
    if (m.error) return fail(m.error.message, 500);
    hiddenTracks = t.data?.length ?? 0;
    hiddenMixes = m.data?.length ?? 0;
  }

  const del = await sb.from("sources").delete().eq("id", src.id);
  if (del.error) return fail(del.error.message, 500);

  // Never suggest it again. Best effort: if supabase/add_discover.sql has not been run yet, this is simply skipped.
  await sb.from("source_suggestions").upsert(
    { name: src.name, name_key: nameKeyOf(src.name as string), platform_id: src.platform_id ?? null, url: src.url, genre: src.genre ?? "dnb", status: "rejected", reason: "Removed from your channels", decided_at: new Date().toISOString() },
    { onConflict: "name_key" },
  );

  return NextResponse.json({ ok: true, name: src.name, hiddenTracks, hiddenMixes });
}
