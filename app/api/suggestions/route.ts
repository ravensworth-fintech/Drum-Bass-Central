import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { scanAny } from "@/lib/run-ingest";
import { Source } from "@/lib/scan-source";
import { parseGenre } from "@/lib/genres";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/** Pending Discover suggestions, best first (most credits). Admin only. */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return fail(a.error, a.status);
  const { data, error } = await a.sb.from("source_suggestions")
    .select("id,name,platform_id,url,genre,reason,evidence_count,thumbnail_url,subscribers,description,last_upload_at")
    .eq("status", "pending").order("evidence_count", { ascending: false }).order("found_at", { ascending: false }).limit(100);
  if (error) return fail(`${error.message}. If this says the table is missing, run supabase/add_discover.sql in the Supabase SQL Editor.`, 500);
  return NextResponse.json({ ok: true, suggestions: data ?? [] });
}

/** Body: { id, action: "add" | "skip", genre?, isArtist? }. "add" follows the channel and scans it now (like ADD +); "skip" is remembered so it is never suggested again. */
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return fail(a.error, a.status);
  let body: { id?: string; action?: string; genre?: string; isArtist?: boolean };
  try { body = await req.json(); } catch { return fail("Bad request."); }
  if (!body.id || (body.action !== "add" && body.action !== "skip")) return fail("Bad request.");
  const sb = a.sb;

  const { data: s } = await sb.from("source_suggestions").select("id,name,platform_id,genre,status").eq("id", body.id).maybeSingle();
  if (!s || s.status !== "pending") return fail("That suggestion is no longer pending. Refresh the page.", 404);

  if (body.action === "skip") {
    const { error } = await sb.from("source_suggestions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", s.id);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true, name: s.name, skipped: true });
  }

  if (!s.platform_id) return fail("This suggestion has no channel attached.", 500);
  const genre = parseGenre(body.genre ?? s.genre);
  try {
    // Already followed (maybe under another name, or switched off)? Reuse it instead of adding a duplicate.
    const { data: existing } = await sb.from("sources").select("id,name,url,kind,platform_id,is_artist,genre").eq("platform_id", s.platform_id).limit(1);
    let src: Source;
    let already = false;
    if (existing?.length) {
      already = true;
      src = existing[0] as Source;
      await sb.from("sources").update({ enabled: true }).eq("id", src.id);
    } else {
      const { data, error } = await sb.from("sources").insert({
        name: s.name, kind: "youtube", url: `https://www.youtube.com/channel/${s.platform_id}`, platform_id: s.platform_id,
        monitorable: "auto", enabled: true, genre, is_artist: body.isArtist !== false,
      }).select("id,name,url,kind,platform_id,is_artist,genre").single();
      if (error) return fail(error.message, 500);
      src = data as Source;
    }
    await sb.from("source_suggestions").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", s.id);
    const scan = await scanAny(sb, src);
    return NextResponse.json({ ok: true, already, name: src.name, genre: src.genre ?? genre, scan });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
