"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useIsMobile } from "@/components/DeviceProvider";
import { clearListCache } from "@/lib/list-cache";

type ScanResult = { ok?: boolean; error?: string; found?: number; added?: number; mixes_added?: number; skipped?: number };

/** "ADD +" (any signed-in account): paste a YouTube or SoundCloud link, pick a genre, and the channel is added to YOUR list (and to the site, if it is new), scanned and the page reloads.
 *  Admins can add without limit; everyone else gets 15 new channels per rolling 24 hours (the server enforces it). */
export function AddSource({ align = "right" }: { align?: "left" | "right" }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [genre, setGenre] = useState<"dnb" | "house" | "dubstep" | "bands">("dnb");
  const [artist, setArtist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in first.");
      const res = await fetch("/api/add-source", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim(), genre, isArtist: artist || /soundcloud\.com/i.test(url) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      const scan: ScanResult = json.scan ?? {};
      if (scan.ok === false) throw new Error(`${json.name} was added to your channels, but the scan failed: ${scan.error}`);
      clearListCache();
      if (json.alreadyFollowing) { setMsg({ text: `You already follow ${json.name}.` }); setBusy(false); return; }
      const left = typeof json.addsLeft === "number" ? ` ${json.addsLeft} new channel${json.addsLeft === 1 ? "" : "s"} left today.` : "";
      setMsg({ text: `Added ${json.name}${json.existed ? " (already on the site)" : ""}. ${scan.added ?? 0} new tracks, ${scan.mixes_added ?? 0} new mixes.${left} Refreshing…` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="border border-[#c6ff00] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#c6ff00] hover:bg-[#c6ff00] hover:text-black">ADD +</button>
      {open && (
        <div className={`z-[60] border border-white/20 bg-black p-4 text-white shadow-xl ${mobile ? "fixed inset-x-3 top-20" : `absolute ${align === "left" ? "left-0" : "right-0"} z-20 mt-2 w-80`}`}>
          <label className="mb-1 block text-xs uppercase tracking-widest text-white/60">YouTube channel link</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus
            placeholder="youtube.com/@Channel or soundcloud.com/artist" className="mb-3 w-full border border-white/20 bg-transparent px-3 py-1.5 text-sm" />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["dnb", "house", "dubstep", "bands"] as const).map((g) => (
              <button key={g} onClick={() => { setGenre(g); if (g === "bands") setArtist(true); }} aria-pressed={genre === g}
                className={`border px-3 py-1 text-xs font-bold uppercase tracking-widest ${genre === g ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70"}`}>{g === "dnb" ? "D&B" : g === "house" ? "House" : g === "dubstep" ? "Dubstep" : "Bands"}</button>
            ))}
          </div>
          <label className="mb-3 flex items-start gap-2 text-xs text-white/60">
            <input type="checkbox" checked={artist} onChange={(e) => setArtist(e.target.checked)} className="mt-0.5 accent-[#c6ff00]" />
            <span>An artist&apos;s own channel (uploads are titled with just the track name)</span>
          </label>
          <button onClick={submit} disabled={busy || !url.trim()} className="w-full bg-[#c6ff00] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">
            {busy ? "Adding and scanning…" : "Add channel"}
          </button>
          {msg && <p className={`mt-3 text-xs ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
