"use client";
import { useState } from "react";
import { downloadTrackListPdf, PdfTrack } from "@/lib/pdf";

// Pass the tracks currently shown (already filtered/sorted), or an async getter
// that fetches ALL filtered results when the page is paginated.
export function DownloadPdfButton({ title, tracks }: {
  title: string;
  tracks: PdfTrack[] | (() => Promise<PdfTrack[]>);
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const list = typeof tracks === "function" ? await tracks() : tracks;
          if (list.length) downloadTrackListPdf(title, list);
        } finally { setBusy(false); }
      }}
      className="border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest hover:border-[#c6ff00] hover:text-[#c6ff00] disabled:opacity-50"
    >
      {busy ? "Preparing…" : "Download PDF"}
    </button>
  );
}
