import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localBackend } from "./localBackend";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No keys yet → run free in local-only mode (data stays in this browser).
export const IS_LOCAL = !url || !key;

function makeClient(room?: string): SupabaseClient {
  return createClient(url as string, key as string, {
    auth: { persistSession: false },
    // The room (password hash) rides along as a header on every request.
    // The database's RLS only returns rows whose room matches it — so data
    // can't be read without knowing the password, even with the public key.
    global: room ? { headers: { "x-room": room } } : undefined,
  });
}

// Live binding: importers always read the current (room-scoped) client.
export let supabase: SupabaseClient = IS_LOCAL
  ? (localBackend as unknown as SupabaseClient)
  : makeClient();

export function setRoom(room: string): void {
  if (!IS_LOCAL) supabase = makeClient(room);
}
