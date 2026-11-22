// SERVER ONLY. Per-user channel helpers: who follows what, and the "15 new channels per rolling 24 hours" limit for non-admins.
import { admin } from "@/lib/supabase-admin";

type SB = ReturnType<typeof admin>;
export const DAILY_ADD_LIMIT = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How many more channels a non-admin may add right now, and (when the limit is reached) roughly when a slot frees up. */
export async function addAllowance(sb: SB, userId: string): Promise<{ left: number; freesInMinutes: number | null }> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data } = await sb.from("source_add_log").select("created_at").eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: true }).limit(DAILY_ADD_LIMIT + 5);
  const used = data?.length ?? 0;
  const left = Math.max(0, DAILY_ADD_LIMIT - used);
  if (left > 0 || !data?.length) return { left, freesInMinutes: null };
  const oldest = Date.parse(data[used - DAILY_ADD_LIMIT].created_at as string); // the add that expires first
  return { left: 0, freesInMinutes: Math.max(1, Math.ceil((oldest + DAY_MS - Date.now()) / 60000)) };
}

export const limitMessage = (freesInMinutes: number | null) => {
  const when = freesInMinutes == null ? "" : freesInMinutes < 90 ? ` Another slot opens in about ${freesInMinutes} minutes.` : ` Another slot opens in about ${Math.ceil(freesInMinutes / 60)} hours.`;
  return `You've added ${DAILY_ADD_LIMIT} channels in the last 24 hours, which is the daily limit.${when}`;
};

export async function logAdd(sb: SB, userId: string) {
  await sb.from("source_add_log").insert({ user_id: userId });
}

/** Adds the channel to this person's list. Returns true if they were already following it. */
export async function follow(sb: SB, userId: string, sourceId: string): Promise<{ already: boolean; error?: string }> {
  const { data: have } = await sb.from("user_sources").select("source_id").eq("user_id", userId).eq("source_id", sourceId).maybeSingle();
  if (have) return { already: true };
  const { error } = await sb.from("user_sources").insert({ user_id: userId, source_id: sourceId });
  if (error && error.code !== "23505") return { already: false, error: error.message };
  return { already: false };
}
