"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type ScanResult = { ok?: boolean; error?: string; found?: number; added?: number; mixes_added?: number; skipped?: number };

/** "ADD +" (admins only): paste a YouTube channel link, pick a genre, and the site adds it as a source, scans it and reloads. */
export function AddSource() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [genre, setGenre] = useState<"dnb" | "house">("dnb");
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
        body: JSON.stringify({ url: url.trim(), genre, isArtist: artist }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Something went wrong (HTTP ${res.status}).`);
      const scan: ScanResult = json.scan ?? {};
      if (scan.ok === false) throw new Error(`${json.name} was ${json.already ? "already in your sources" : "added"}, but the scan failed: ${scan.error}`);
      setMsg({ text: `${json.already ? "Already a source: " : "Added "}${json.name}. ${scan.added ?? 0} new tracks, ${scan.mixes_added ?? 0} new mixes. Refreshing…` });
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
        <div className="absolute right-0 z-20 mt-2 w-80 border border-white/20 bg-black p-4 text-white shadow-xl">
          <label className="mb-1 block text-xs uppercase tracking-widest text-white/60">YouTube channel link</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus
            placeholder="https://www.youtube.com/@ChannelName" className="mb-3 w-full border border-white/20 bg-transparent px-3 py-1.5 text-sm" />
          <div className="mb-3 flex items-center gap-2">
            {(["dnb", "house"] as const).map((g) => (
              <button key={g} onClick={() => setGenre(g)} aria-pressed={genre === g}
                className={`border px-3 py-1 text-xs font-bold uppercase tracking-widest ${genre === g ? "border-[#c6ff00] bg-[#c6ff00] text-black" : "border-white/20 text-white/70"}`}>{g === "dnb" ? "D&B" : "House"}</button>
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
