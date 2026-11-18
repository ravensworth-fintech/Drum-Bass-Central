import { jsPDF } from "jspdf";

export type PdfTrack = { artist: string; title: string };

export function downloadTrackListPdf(pageTitle: string, tracks: PdfTrack[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48, lineH = 16, width = 595 - margin * 2, bottom = 842 - margin;
  let y = margin;

  doc.setFont("helvetica", "bold").setFontSize(16).text(pageTitle, margin, y);
  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10)
     .text(`${tracks.length} tracks - ${new Date().toLocaleDateString()}`, margin, y);
  y += 24;
  doc.setFontSize(11);

  tracks.forEach((t, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${t.artist} - ${t.title}`, width);
    if (y + lines.length * lineH > bottom) { doc.addPage(); y = margin; }
    doc.text(lines, margin, y);
    y += lines.length * lineH;
  });

  const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`${slug || "tracklist"}.pdf`);
}
