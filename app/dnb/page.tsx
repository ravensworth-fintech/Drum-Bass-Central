import { TracksPage } from "@/components/TracksPage";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DnB() { return TracksPage({ genre: "dnb", heading: "D&B" }); }
