import { TracksPage } from "@/components/TracksPage";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Dubstep() { return TracksPage({ genre: "dubstep", heading: "Dubstep" }); }
