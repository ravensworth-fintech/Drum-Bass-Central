"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useIsMobile } from "@/components/DeviceProvider";

/** "INGEST" (admins only): scans every enabled channel for new tracks and mixes, then reloads the page. */
export function IngestButton() {
  const mobile = useIsMobile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true); setMsg({ text: "Starting…" });
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in first.");
      let since: string | undefined;
      const total = { scanned: 0, failed: 0, added: 0, mixes: 0 };
      let remaining = 0;
      for (let round = 1; round <= 8; round++) {
        const res = await fetch("/api/run-ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ since }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}). If it timed out, press INGEST again.`);
        since = json.session;
        total.scanned += json.scanned; total.failed += json.failed; total.added += json.added; total.mixes += json.mixes_added;
        remaining = json.remaining;
        if (!remaining) break;
        setMsg({ text: `Scanned ${total.scanned} channels so far, ${remaining} to go…` });
      }
      const done = remaining ? ` ${remaining} channels are still waiting. Press INGEST again to continue.` : "";
      setMsg({ text: `Scanned ${total.scanned} channels: ${total.added} new tracks, ${total.mixes} new mixes${total.failed ? `, ${total.failed} channels had errors` : ""}.${done} Refreshing…` });
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={run} disabled={busy} className="border border-[#c6ff00] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black disabled:opacity-50">
        {busy ? "Scanning…" : "INGEST"}
      </button>
      {msg && <p className={`z-[60] border border-white/20 bg-black p-3 text-xs ${mobile ? "fixed inset-x-3 top-20" : "absolute right-0 z-20 mt-2 w-72"} ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
    </div>
  );
}
