"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function AuthCallback() {
  const [msg, setMsg] = useState("Signing you in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const fail = (m: string) => { setMsg(m); setFailed(true); };
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const problem = query.get("error_description") || hash.get("error_description");
      if (problem) return fail(`Sign-in failed: ${problem.replace(/\+/g, " ")}. Request a fresh link and open it right away.`);

      const supabase = createClient();
      // getSession waits for the client's own automatic code exchange to finish.
      let { data } = await supabase.auth.getSession();
      const code = query.get("code");
      if (!data.session && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return fail(`Sign-in failed: ${error.message}. Open the email link in the same browser you requested it from.`);
        data = (await supabase.auth.getSession()).data;
      }
      if (!data.session) return fail("No sign-in found. Request a new link and open it in the same browser you requested it from.");
      window.location.replace("/liked");
    })();
  }, []);

  return (
    <div className="max-w-sm">
      <h1 className="mb-4 text-2xl font-black uppercase">Sign in</h1>
      <p className={failed ? "text-red-400" : "text-white/70"}>{msg}</p>
      {failed && <a href="/login" className="mt-4 inline-block text-[#c6ff00] underline">Try again</a>}
    </div>
  );
}
