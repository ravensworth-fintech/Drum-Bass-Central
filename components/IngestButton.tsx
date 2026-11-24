"use client";
import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/use-session";
import { clearListCache } from "@/lib/list-cache";

type Status = { at: string; by: "manual" | "scheduled"; ok: boolean; message: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** "INGEST" (admins only): scans every enabled channel for new tracks and mixes. The result stays on the page, under the button,
 *  with the time of the last run (manual or scheduled). It is saved on the server, so it is still there after a reload. */
export function IngestButton({ children }: { children?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [last, setLast] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/ingest-status", { headers: await authHeaders(), cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok && json.ok) { setLast(json.status ?? null); if (json.error) setLoadErr(`${json.error}. Run supabase/add_remove_and_status.sql in the Supabase SQL Editor to save the last status.`); }
      } catch { /* leave it empty */ }
      if (live) setLoaded(true);
    })();
    return () => { live = false; };
  }, []);

  async function save(s: { ok: boolean; scanned: number; added: number; mixes: number; failed: number; remaining: number; message: string }) {
    const at = new Date().toISOString();
    setLast({ at, by: "manual", ok: s.ok, message: s.message }); // show it right away, even if saving fails
    try { await fetch("/api/ingest-status", { method: "POST", headers: await authHeaders(), body: JSON.stringify(s) }); } catch { /* shown on screen anyway */ }
  }

  async function run() {
    if (busy) return;
    setBusy(true); setProgress("Starting…");
    const total = { scanned: 0, failed: 0, added: 0, mixes: 0, remaining: 0 };
    try {
      const headers = await authHeaders();
      let since: string | undefined;
      for (let round = 1; round <= 8; round++) {
        const res = await fetch("/api/run-ingest", { method: "POST", headers, body: JSON.stringify({ since }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}). If it timed out, press INGEST again.`);
        since = json.session;
        total.scanned += json.scanned; total.failed += json.failed; total.added += json.added; total.mixes += json.mixes_added;
        total.remaining = json.remaining;
        if (!total.remaining) break;
        setProgress(`Scanned ${total.scanned} channels so far, ${total.remaining} to go…`);
      }
      clearListCache(); // other tabs fetch the new tracks next time they open
      await save({ ok: true, ...total, message: `Scanned ${total.scanned} channels: ${total.added} new tracks, ${total.mixes} new mixes${total.failed ? `, ${total.failed} channels had errors` : ""}.${total.remaining ? ` ${total.remaining} channels are still waiting. Press INGEST again to continue.` : ""}` });
    } catch (e) {
      await save({ ok: false, ...total, message: e instanceof Error ? e.message : String(e) });
    }
    setProgress(""); setBusy(false);
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        <button onClick={run} disabled={busy} className="shrink-0 border border-[#c6ff00] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black disabled:opacity-50">
          {busy ? "Scanning…" : "INGEST"}
        </button>
        {children && <p className="pt-1.5 text-xs text-white/50">{children}</p>}
      </div>
      <div className="mt-3 text-xs" aria-live="polite">
        {busy ? (
          <p className="text-[#c6ff00]">{progress}</p>
        ) : last ? (
          <>
            <p className="text-white/50">Last run: {when(last.at)} ({last.by === "scheduled" ? "scheduled" : "manual"})</p>
            <p className={`mt-0.5 ${last.ok ? "text-[#c6ff00]" : "text-red-400"}`}>{last.ok ? "" : "Failed: "}{last.message}</p>
          </>
        ) : loaded ? (
          <p className="text-white/40">No ingest recorded yet.</p>
        ) : null}
        {!busy && loadErr && <p className="mt-1 text-red-400">{loadErr}</p>}
      </div>
    </div>
  );
}
