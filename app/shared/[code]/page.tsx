import LikedClient from "@/components/LikedClient";
export const dynamic = "force-dynamic";
// A share link is private: keep it out of search engines and out of the Referer header sent to YouTube/SoundCloud.
export const metadata = { title: "Shared likes", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function SharedLikes({ params }: { params: { code: string } }) {
  return <LikedClient shareCode={params.code} />;
}
