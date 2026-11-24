export type AdminAccessResult = 'granted' | 'denied' | 'error';

export interface AllowlistQueryResult {
  data: Array<{ user_id?: string }> | null;
  error: unknown;
}

/**
 * Decides admin access from the admin_users allowlist query. Fails closed:
 * - 'granted' only when the query succeeds and returns at least one row;
 * - 'denied' when the query succeeds with no rows;
 * - 'error' when the query fails or throws on every attempt (never treated as granted).
 * The query is tried at most `attempts` times, only retrying on errors.
 */
export async function resolveAdminAccess(
  runQuery: () => Promise<AllowlistQueryResult>,
  attempts = 2
): Promise<AdminAccessResult> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await runQuery();
      if (!res.error) {
        return res.data && res.data.length > 0 ? 'granted' : 'denied';
      }
    } catch {
      // treated like a query error; retry if attempts remain
    }
  }
  return 'error';
}

/** Lets only the most recently started check apply its result. */
export function createLatestGate() {
  let current = 0;
  return {
    start(): () => boolean {
      const id = ++current;
      return () => id === current;
    },
    invalidate(): void {
      current++;
    },
  };
}
