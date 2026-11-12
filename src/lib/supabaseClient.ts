import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Resolve environment variables explicitly from Vite runtime
const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
)?.trim();

// STRICT SECURITY GUARD:
// Service role keys or secret keys (`sb_secret_...`) are strictly forbidden in client-side code.
if (
  envKey &&
  (envKey.startsWith('sb_secret_') ||
    envKey.includes('service_role') ||
    envKey.toLowerCase().includes('secret'))
) {
  throw new Error(
    'CRITICAL SECURITY VIOLATION: A service_role or secret API key was detected in frontend environment variables. ' +
    'The browser bundle must exclusively receive the public publishable anon key.'
  );
}

// Check configuration validity without hardcoding silent production fallbacks
export const isConfigured = Boolean(
  envUrl &&
  envUrl !== 'https://your-project-ref.supabase.co' &&
  (envUrl.startsWith('http://') || envUrl.startsWith('https://')) &&
  envKey &&
  envKey !== 'your-supabase-anon-publishable-key' &&
  envKey.length >= 10
);

if (!isConfigured) {
  console.warn(
    '[Mero Boutique] Supabase configuration is missing or incomplete. ' +
    'Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
  );
}

const targetUrl = isConfigured ? envUrl! : 'https://unconfigured-store.supabase.co';
const targetKey = isConfigured ? envKey! : 'unconfigured-anon-key';

/**
 * Singleton Supabase client for client-side operations.
 * Uses exclusively the public anon key with browser storage and Row Level Security.
 */
export const supabase: SupabaseClient = createClient(targetUrl, targetKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export default supabase;
