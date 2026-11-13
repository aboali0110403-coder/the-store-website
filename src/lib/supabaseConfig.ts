export interface SupabaseConfig {
  url: string;
  key: string;
}

export type SupabaseEnvironment = Record<string, string | undefined>;

const CONFIGURATION_ERROR =
  'Supabase configuration error: set VITE_SUPABASE_URL and either VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.';
const SECRET_KEY_ERROR =
  'Supabase configuration error: the client key must be a public publishable/anon key, not a service or secret key.';

function isPublicKey(value: string): boolean {
  return !(
    value.startsWith('sb_secret_') ||
    value.includes('service_role') ||
    value.toLowerCase().includes('secret')
  );
}

function isValidSupabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname) &&
      parsed.hostname !== 'your-project-ref.supabase.co' &&
      parsed.hostname !== 'unconfigured-store.supabase.co'
    );
  } catch {
    return false;
  }
}

export function resolveSupabaseConfig(env: SupabaseEnvironment): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const key = publishableKey || anonKey;

  if (!url || !isValidSupabaseUrl(url) || !key || key.length < 10) {
    throw new Error(CONFIGURATION_ERROR);
  }
  if (!isPublicKey(key)) {
    throw new Error(SECRET_KEY_ERROR);
  }

  return { url, key };
}
