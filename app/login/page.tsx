"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  async function submit() {
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setMsg(error ? error.message : "Check your email for the sign-in link.");
  }
  return (
    <div className="max-w-sm">
      <h1 className="mb-4 text-2xl font-black uppercase">Sign in</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="mb-3 w-full border border-white/20 bg-transparent px-3 py-2" />
      <button onClick={submit} className="bg-[#c6ff00] px-4 py-2 text-sm font-bold uppercase text-black">Email me a link</button>
      {msg && <p className="mt-3 text-sm text-white/70">{msg}</p>}
    </div>
  );
}
