import "./globals.css";
import Link from "next/link";
import { AuthNav } from "@/components/AuthNav";
import { PlayerProvider } from "@/components/PlayerProvider";
export const metadata = { title: "DropTheFire" };
const nav = [["/", "Discover"], ["/dnb", "D&B"], ["/house", "House"], ["/mixes", "Mixes"], ["/liked", "Likes"]];
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><PlayerProvider>
      <header className="flex items-center gap-6 border-b border-white/10 px-6 py-4">
        <Link href="/" className="font-black uppercase tracking-widest text-[#c6ff00]">DropTheFire</Link>
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="text-sm uppercase tracking-widest text-white/70 hover:text-white">{label}</Link>
        ))}
        <AuthNav />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </PlayerProvider></body></html>
  );
}
