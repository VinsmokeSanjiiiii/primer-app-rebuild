import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client singleton.
 *
 * When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in the
 * environment the client connects to the real backend.  When they are
 * missing or empty the client is null and the app falls back to the
 * local seed-data repository (see repository.ts).
 */
let client: SupabaseClient | null = null;

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

if (url && key) {
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export function getSupabase(): SupabaseClient | null {
  return client;
}

/**
 * Returns true when the Supabase client is configured and ready.
 * UI can use this to decide whether to call repository methods that
 * hit the network vs. falling back to local data.
 */
export function isSupabaseConfigured(): boolean {
  return client !== null;
}
