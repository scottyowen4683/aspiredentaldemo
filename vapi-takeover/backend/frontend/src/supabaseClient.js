// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Hardcoded Supabase config (public keys - safe to expose)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zykdlsvtofzojgojmkdg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5a2Rsc3Z0b2Z6b2pnb2pta2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5OTkzMDksImV4cCI6MjA4NDU3NTMwOX0.J_xF_wrCo8S3E7NDKYJdHGNfgAAr7IJA9GGbQNdPaMQ';

// Debug: log configuration
console.log('Supabase config:', {
  url: supabaseUrl,
  keyPrefix: supabaseAnonKey?.substring(0, 20) + '...'
});

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'Cache-Control': 'no-cache',
      },
    },
  }
)
