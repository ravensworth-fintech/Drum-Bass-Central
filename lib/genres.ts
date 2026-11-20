/** Every genre a source, track or mix can have. Fresh Fire (the home page) shows DISCOVER_GENRES; Bands stays on its own tab. */
export type GenreKey = "dnb" | "house" | "dubstep" | "bands";
export const DISCOVER_GENRES: GenreKey[] = ["dnb", "house", "dubstep"];
export const parseGenre = (g: unknown): GenreKey => (g === "house" || g === "dubstep" || g === "bands" ? g : "dnb");
