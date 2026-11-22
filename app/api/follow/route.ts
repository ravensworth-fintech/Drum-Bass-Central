import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Body: { action: "starters" } follows every channel in the starter set (the one-click start for a new account), or
 * { action: "follow", id } follows one channel that is already on the site (admin "Everyone" view).
 * Following channels that already exist costs no scanning, so these do not count toward the daily add limit.
 */
export async function POST(req: Request) {
  const u = await requireUser(req);
  if (!u.ok) return fail(u.error, u.status);
  let body: { action?: string; id?: string };
  try { body = await req.json(); } catch { return fail("Bad request."); }

  if (body.action === "follow") {
    if (!body.id) return fail("Bad request.");
    if (!u.isAdmin) return fail("Add channels with ADD + instead.", 403);
    const { error } = await u.sb.from("user_sources").upsert({ user_id: u.userId, source_id: body.id }, { onConflict: "user_id,source_id", ignoreDuplicates: true });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "starters") {
    const { data, error } = await u.sb.from("sources").select("id").eq("is_starter", true).in("kind", ["youtube", "soundcloud"]).limit(5000);
    if (error) return fail(error.message, 500);
    const rows = (data ?? []).map((s) => ({ user_id: u.userId, source_id: s.id as string }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e2 } = await u.sb.from("user_sources").upsert(rows.slice(i, i + 500), { onConflict: "user_id,source_id", ignoreDuplicates: true });
      if (e2) return fail(e2.message, 500);
    }
    return NextResponse.json({ ok: true, count: rows.length });
  }
  return fail("Bad request.");
}
