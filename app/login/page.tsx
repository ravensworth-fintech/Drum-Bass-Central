"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { clearListCache } from "@/lib/list-cache";
import { rememberNext, safeNext, takeNext } from "@/lib/next-path";

type Mode = "signin" | "signup" | "code";
const nice = (m: string) =>
  /rate limit/i.test(m) ? "Too many emails were sent recently. Wait a few minutes, or use a password instead." : m;
const input = "mb-3 w-full border border-white/20 bg-transparent px-3 py-2";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // ?next=/some/page sends the person back there after signing in (used when they try to like something on a shared page).
  const nextParam = () => safeNext(new URLSearchParams(window.location.search).get("next"));
  const done = () => { clearListCache(); const stored = takeNext(); window.location.assign(nextParam() ?? stored ?? "/liked"); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const sb = createClient();
      const redirect = `${window.location.origin}/auth/callback`;
      rememberNext(nextParam()); // the email-link and confirm-email routes come back through /auth/callback, which reads this
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return done();
      }
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.user && data.user.identities?.length === 0) return setMsg("That email already has an account. Use Sign in.");
        if (data.session) return done();
        return setMsg("Account created. Check your email to confirm it, then sign in.");
      }
      if (!sent) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setSent(true);
        return setMsg("Check your email. Open the link in this same browser, or type the 6-digit code below if the email shows one.");
      }
      const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) throw error;
      done();
    } catch (err) {
      setMsg(nice(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setMsg(""); setSent(false); }}
      className={`px-3 py-1.5 text-xs uppercase tracking-widest ${mode === m ? "bg-[#c6ff00] font-bold text-black" : "border border-white/20 text-white/70"}`}>{label}</button>
  );

  return (
    <div className="max-w-sm">
      <h1 className="mb-4 text-2xl font-black uppercase">Sign in</h1>
      <div className="mb-4 flex flex-wrap gap-2">{tab("signin", "Password")}{tab("signup", "Create account")}{tab("code", "Email link")}</div>
      <form onSubmit={submit}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" className={input} />
        {mode !== "code" && (
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ characters)"
            autoComplete={mode === "signin" ? "current-password" : "new-password"} className={input} />
        )}
        {mode === "code" && sent && (
          <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code (optional)" className={input} />
        )}
        <button disabled={busy} className="bg-[#c6ff00] px-4 py-2 text-sm font-bold uppercase text-black disabled:opacity-50">
          {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : sent && code ? "Verify code" : sent ? "Resend link" : "Email me a link"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-white/70">{msg}</p>}
    </div>
  );
}
