// SERVER ONLY. The last ingest result, stored in app_status (key "last_ingest") so the Dashboard can show it after a reload or from another device.
import { admin } from "@/lib/supabase-admin";

export type IngestStatus = {
  at: string;                       // ISO time the run finished
  by: "manual" | "scheduled";
  ok: boolean;
  scanned: number; added: number; mixes: number; failed: number; remaining: number;
  message: string;                  // plain-language summary (or the error)
};

export async function saveIngestStatus(sb: ReturnType<typeof admin>, s: IngestStatus): Promise<void> {
  try { await sb.from("app_status").upsert({ key: "last_ingest", value: s, updated_at: new Date().toISOString() }, { onConflict: "key" }); }
  catch { /* the status is a nicety: never let it break an ingest */ }
}

export async function loadIngestStatus(sb: ReturnType<typeof admin>): Promise<{ status: IngestStatus | null; error?: string }> {
  const { data, error } = await sb.from("app_status").select("value").eq("key", "last_ingest").maybeSingle();
  if (error) return { status: null, error: error.message };
  return { status: (data?.value as IngestStatus | undefined) ?? null };
}

export const summarize = (r: { scanned: number; added: number; mixes: number; failed: number; remaining: number }) =>
  `Scanned ${r.scanned} channels: ${r.added} new tracks, ${r.mixes} new mixes${r.failed ? `, ${r.failed} channels had errors` : ""}.${r.remaining ? ` ${r.remaining} channels are still waiting.` : ""}`;
