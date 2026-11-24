import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { IngestStatus, loadIngestStatus, saveIngestStatus } from "@/lib/ingest-status";

export const dynamic = "force-dynamic";

/** Admin only. GET: the last ingest result (or null). POST: the INGEST button saves the result of a manual run here when it finishes or fails. */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const r = await loadIngestStatus(a.sb);
  return NextResponse.json({ ok: true, status: r.status, ...(r.error ? { error: r.error } : {}) });
}

export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  let b: Partial<IngestStatus>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 }); }
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  const status: IngestStatus = {
    at: new Date().toISOString(), by: "manual", ok: !!b.ok,
    scanned: n(b.scanned), added: n(b.added), mixes: n(b.mixes), failed: n(b.failed), remaining: n(b.remaining),
    message: String(b.message ?? "").slice(0, 500),
  };
  await saveIngestStatus(a.sb, status);
  return NextResponse.json({ ok: true, status });
}
