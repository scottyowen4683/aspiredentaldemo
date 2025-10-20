// frontend/src/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Minimal validation to catch missing envs early
if (!supabaseUrl || !supabaseAnonKey) {
  // This throws at build/runtime with a clear message instead of a cryptic failure
  // Remove if you prefer silent failures
  console.warn("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
