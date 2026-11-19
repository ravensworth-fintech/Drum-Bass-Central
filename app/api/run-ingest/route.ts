import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runIngest } from "@/lib/run-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Powers the INGEST button (admins only; the browser sends its Supabase login token, so no secret is needed in the address bar).
 * Body: { since?: ISO time }. The first call has no `since` and returns `session`; the button sends that back on each later call
 * so the whole list is worked through once. `remaining` is how many enabled sources are still waiting.
 */
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  let body: { since?: string } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }
  const session = new Date().toISOString();
  const since = body.since && !Number.isNaN(Date.parse(body.since)) ? new Date(body.since).toISOString() : undefined;
  try {
    const r = await runIngest(a.sb, since);
    const rs = r.results as { ok: boolean; added?: number; mixes_added?: number }[];
    return NextResponse.json({
      ok: true,
      session: since ?? session,
      scanned: rs.length,
      failed: rs.filter((x) => !x.ok).length,
      added: rs.reduce((n, x) => n + (x.added ?? 0), 0),
      mixes_added: rs.reduce((n, x) => n + (x.mixes_added ?? 0), 0),
      remaining: r.notReached.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
