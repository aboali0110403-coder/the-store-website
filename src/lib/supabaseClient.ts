import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './supabaseConfig';

const { url, key } = resolveSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

/**
 * Singleton Supabase client for client-side operations.
 * Uses exclusively the public anon key with browser storage and Row Level Security.
 */
export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export default supabase;
