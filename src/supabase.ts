import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localBackend } from "./localBackend";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No keys yet → run free in local-only mode (data stays in this browser).
// Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to .env for real sync.
export const IS_LOCAL = !url || !key;

export const supabase: SupabaseClient = IS_LOCAL
  ? (localBackend as unknown as SupabaseClient)
  : createClient(url as string, key as string);
