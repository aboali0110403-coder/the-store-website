import { createClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://pvvsvxdqjguemptocvcs.supabase.co';
const FALLBACK_ANON_KEY = 'sb_publishable_mbcIpQSy7CvVEiuxD6xN_A_KQ9doMpj';

function resolveSupabaseUrl(): string {
  const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  if (!rawUrl || rawUrl === 'undefined' || rawUrl === 'null' || rawUrl === 'MY_SUPABASE_URL') {
    return FALLBACK_SUPABASE_URL;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return rawUrl;
    }
  } catch {
    // Malformed URL, fall back to known live project endpoint
  }
  return FALLBACK_SUPABASE_URL;
}

function resolveSupabaseAnonKey(): string {
  const rawKey = (
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  )?.trim();

  // STRICT SECURITY GUARD:
  // Secret API keys (`sb_secret_...`) and service_role keys are forbidden in client-side code.
  // The browser must only ever use the Supabase publishable/anon key.
  if (
    rawKey &&
    (rawKey.startsWith('sb_secret_') ||
      rawKey.includes('service_role') ||
      rawKey.toLowerCase().includes('secret'))
  ) {
    // Safely discard the forbidden secret key and fall back to public anon key
    return FALLBACK_ANON_KEY;
  }

  if (
    !rawKey ||
    rawKey === 'undefined' ||
    rawKey === 'null' ||
    rawKey === 'MY_SUPABASE_KEY' ||
    rawKey.length < 10
  ) {
    return FALLBACK_ANON_KEY;
  }

  // Only accept verified publishable keys (sb_publishable_...) or standard anon JWTs (eyJ...)
  if (rawKey.startsWith('sb_publishable_') || rawKey.startsWith('eyJ')) {
    return rawKey;
  }

  return FALLBACK_ANON_KEY;
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = resolveSupabaseAnonKey();

/**
 * Singleton Supabase client for client-side operations.
 * Uses only publishable anon key with browser storage and RLS.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export default supabase;
