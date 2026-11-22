import { TracksBrowser } from "@/components/TracksBrowser";
import { GenreKey } from "@/lib/genres";

/** Shared by Fresh Fire (D&B + House + Dubstep), D&B, House, Dubstep and Bands. The list itself loads in the browser (see TracksBrowser),
 *  because what it shows depends on who is signed in and the server can't tell. "Load more" fetches the next 30. */
export async function TracksPage({ genre, heading }: { genre?: GenreKey; heading: string }) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-black uppercase sm:mb-6 sm:text-3xl">{heading}</h1>
      <TracksBrowser genre={genre} label={heading} />
    </>
  );
}
