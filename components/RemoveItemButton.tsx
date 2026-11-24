"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders, useSignedIn } from "@/lib/use-session";
import { clearListCache } from "@/lib/list-cache";
import { useIsMobile } from "./DeviceProvider";

export type RemovedDetail = { kind: "track" | "mix"; id: string };
const EVENT = "item-removed";

/** Lists call this to drop a removed song/mix from what is on screen straight away. */
export function onItemRemoved(handler: (d: RemovedDetail) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<RemovedDetail>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** X button on every song row. It asks for confirmation first. Removing only affects the signed-in person's own lists. */
export function RemoveItemButton({ kind, id, title, artist }: { kind: "track" | "mix"; id: string; title: string; artist?: string }) {
  const signedIn = useSignedIn();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const what = kind === "mix" ? "mix" : "song";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setOpen(false); e.stopPropagation(); };
    window.addEventListener("keydown", onKey, true); // capture: while the box is open, the player's keyboard shortcuts stay quiet
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, busy]);

  if (!signedIn) return null;

  async function confirm() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/remove-item", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ kind, id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      clearListCache();
      setOpen(false);
      window.dispatchEvent(new CustomEvent<RemovedDetail>(EVENT, { detail: { kind, id } }));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <>
      <button onClick={() => { setErr(""); setOpen(true); }} aria-label={`Remove ${what}`} title={`Remove ${what}`}
        className={`shrink-0 text-white/40 hover:text-red-400 ${mobile ? "flex h-11 w-9 items-center justify-center text-lg" : "px-1.5 text-base"}`}>✕</button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!busy) setOpen(false); }} role="presentation">
          <div role="dialog" aria-modal="true" aria-label={`Remove this ${what}?`} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm border border-white/20 bg-black p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest">Remove this {what}?</h2>
            <p className="mt-3 break-words text-sm"><span className="font-semibold">{title}</span>{artist ? <span className="text-white/60"> – {artist}</span> : null}</p>
            <p className="mt-2 text-xs text-white/50">It disappears from your lists{kind === "track" ? " and your likes" : ""}, and re-scanning its channel won&apos;t bring it back. Nobody else is affected.</p>
            {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} autoFocus className="border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 hover:border-white/50 hover:text-white disabled:opacity-40">Cancel</button>
              <button onClick={confirm} disabled={busy} className="bg-red-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-400 disabled:opacity-50">{busy ? "Removing…" : "Remove"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
