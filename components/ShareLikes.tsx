"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

/** Dashboard: turn the read-only link to your Likes page on or off, copy it, or replace it with a new one (which kills the old one).
 *  Anyone with the link can see and play your likes and copy their links; they can't change anything of yours. */
export function ShareLikes() {
  const [code, setCode] = useState<string | null | undefined>(undefined); // undefined = loading, null = no link
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function load() {
    const { data, error } = await createClient().from("likes_shares").select("code").maybeSingle();
    if (error) { setMsg({ text: error.message, bad: true }); setCode(null); return; }
    setCode((data?.code as string | undefined) ?? null);
  }
  useEffect(() => { load(); }, []);

  async function makeLink(replace: boolean) {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const sb = createClient();
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) throw new Error("Sign in first.");
      if (replace) { const del = await sb.from("likes_shares").delete().eq("user_id", uid); if (del.error) throw new Error(del.error.message); }
      const { data, error } = await sb.from("likes_shares").insert({}).select("code").single();
      if (error) throw new Error(error.message);
      setCode(data.code as string);
      setMsg({ text: replace ? "New link created. The old one no longer works." : "Link created." });
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const sb = createClient();
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) throw new Error("Sign in first.");
      const del = await sb.from("likes_shares").delete().eq("user_id", uid);
      if (del.error) throw new Error(del.error.message);
      setCode(null);
      setMsg({ text: "Sharing is off. The link no longer works." });
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }); }
    finally { setBusy(false); }
  }

  const url = code ? `${window.location.origin}/shared/${code}` : "";
  async function copy() {
    try { await navigator.clipboard.writeText(url); }
    catch { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    setMsg({ text: "Link copied." });
  }

  const btn = "border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:border-white/50 hover:text-white disabled:opacity-40";
  if (code === undefined) return <p className="text-sm text-white/50">Loading…</p>;
  return (
    <div>
      {code ? (<>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" className="w-full border border-white/20 bg-transparent px-3 py-1.5 text-xs" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={copy} className="bg-[#c6ff00] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-black">Copy link</button>
          <button onClick={() => makeLink(true)} disabled={busy} className={btn}>New link</button>
          <button onClick={turnOff} disabled={busy} className={btn}>Turn off</button>
        </div>
        <p className="mt-3 text-xs text-white/50">Anyone with this link can see your likes live, play them and copy their links. They can&apos;t change your likes. &quot;New link&quot; replaces it and the old link stops working.</p>
      </>) : (
        <button onClick={() => makeLink(false)} disabled={busy} className={btn}>{busy ? "Creating…" : "Create share link"}</button>
      )}
      {msg && <p className={`mt-3 text-xs ${msg.bad ? "text-red-400" : "text-[#c6ff00]"}`}>{msg.text}</p>}
    </div>
  );
}
