// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey,
    {
         auth: {
    persistSession: true, // ✅ REQUIRED
    autoRefreshToken: true, // ✅ RECOMMENDED
    detectSessionInUrl: false, // Disable automatic URL session detection to prevent issues
    flowType: 'pkce', // Use PKCE flow instead of implicit
  },
  global: {
    headers: {
      'Cache-Control': 'no-cache', // Prevent caching issues
    },
  },
    }
)
