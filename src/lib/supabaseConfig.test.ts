import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupabaseConfig } from './supabaseConfig';

const validUrl = 'https://project-ref.supabase.co';
const publishableKey = 'sb_publishable_test_key_123';
const anonKey = 'anon_test_key_123456';

test('resolveSupabaseConfig prefers the publishable key when both supported keys exist', () => {
  assert.deepEqual(
    resolveSupabaseConfig({
      VITE_SUPABASE_URL: validUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      VITE_SUPABASE_ANON_KEY: anonKey,
    }),
    { url: validUrl, key: publishableKey }
  );
});

test('resolveSupabaseConfig accepts the anon key when no publishable key is set', () => {
  assert.deepEqual(
    resolveSupabaseConfig({ VITE_SUPABASE_URL: validUrl, VITE_SUPABASE_ANON_KEY: anonKey }),
    { url: validUrl, key: anonKey }
  );
});

test('resolveSupabaseConfig reports a clear non-secret error when required values are missing', () => {
  assert.throws(
    () => resolveSupabaseConfig({}),
    /Supabase configuration error: set VITE_SUPABASE_URL and either VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY\./
  );
  assert.throws(
    () => resolveSupabaseConfig({ VITE_SUPABASE_URL: validUrl }),
    /Supabase configuration error:/
  );
  assert.throws(
    () => resolveSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey }),
    /Supabase configuration error:/
  );
});

test('resolveSupabaseConfig rejects placeholder endpoints and malformed URLs', () => {
  assert.throws(
    () => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://unconfigured-store.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    }),
    /Supabase configuration error:/
  );
  assert.throws(
    () => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    }),
    /Supabase configuration error:/
  );
});

test('resolveSupabaseConfig rejects service or secret keys without echoing their values', () => {
  const unsafeKey = 'sb_secret_test_key_never_echo';
  assert.throws(
    () => resolveSupabaseConfig({ VITE_SUPABASE_URL: validUrl, VITE_SUPABASE_PUBLISHABLE_KEY: unsafeKey }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /must be a public publishable\/anon key/);
      assert.equal(error.message.includes(unsafeKey), false);
      return true;
    }
  );
});
