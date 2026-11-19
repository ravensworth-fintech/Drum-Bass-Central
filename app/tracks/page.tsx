import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
// "Tracks" is now "D&B". Old bookmarks and links keep working.
export default function Tracks() { redirect("/dnb"); }
