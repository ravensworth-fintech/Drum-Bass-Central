import { MixesBrowser } from "@/components/MixesBrowser";
export const dynamic = "force-dynamic";

export default function Mixes() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-black uppercase sm:mb-6 sm:text-3xl">Mixes</h1>
      <MixesBrowser />
    </>
  );
}
