import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const SAFE_PUBLISHABLE_KEY = 'sb_publishable_mbcIpQSy7CvVEiuxD6xN_A_KQ9doMpj';

// Security Guard: Prevent any server secrets from accidentally leaking through VITE_ variables
const rawAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (rawAnonKey && (rawAnonKey.startsWith('sb_secret_') || rawAnonKey.includes('service_role') || rawAnonKey.toLowerCase().includes('secret'))) {
  // Never move or retain a secret key; overwrite the client-facing value.
  process.env.VITE_SUPABASE_ANON_KEY = SAFE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = SAFE_PUBLISHABLE_KEY;
}

export default defineConfig(() => {
  const resolvedAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY.startsWith('sb_secret_')
      ? process.env.VITE_SUPABASE_ANON_KEY
      : SAFE_PUBLISHABLE_KEY;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(resolvedAnonKey),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(resolvedAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
