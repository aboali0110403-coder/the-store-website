# Mero Boutique — Audit and Stabilization Report

Date: 2026-11-09
Repository: `aboali0110403-coder/the-store-website`
Working branch: `audit/mero-stabilization`
Supabase project: `pvvsvxdqjguemptocvcs`

## Scope and safety status

The repository was cloned and audited on a dedicated branch. No production database mutation was performed. The available Supabase credential is a publishable key; Supabase rejected it for the Data API/schema endpoint with `UNAUTHORIZED_INVALID_API_KEY_TYPE` and `Secret API key required`. Auth settings were readable, and the Storage bucket-list endpoint returned an empty list. Because a live schema dump, function ACL inspection, sequence inspection, and verifiable database backup could not be obtained, no SQL migration was applied.

The bundled historical archive confirms that the original production-oriented RPC contracts were:

- `submit_store_order(text,text,text,text,text,text,text,text,jsonb) RETURNS TABLE(order_id uuid, order_number text)`
- `submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) RETURNS TABLE(request_id uuid, request_number text)`

The current repository migrations replace those contracts with `RETURNS jsonb`, which PostgreSQL cannot do with `CREATE OR REPLACE` when the existing return type differs. The later migration also leaves the older two-argument `lookup_public_order` overload callable while adding a three-argument overload. These migrations were intentionally not applied.

## Findings

### Critical / high priority

1. The hardened three-argument `lookup_public_order` does not replace the older two-argument function. The client calls the two-argument overload, and the older function permits an order lookup without phone verification. Evidence: `supabase/migrations/20261108000000_inventory_storage_and_security.sql:678-771`, `supabase/migrations/20261109050000_corrected_inventory_storage_security.sql:729-836`, and `src/lib/api.ts:1023-1028`.
2. `tracking_token` is present in the corrected table definition but is not added to an already-created `orders` table. The corrected RPC then inserts that missing column. Evidence: corrected migration lines 278-304 and 634-675.
3. Both migrations use `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION` without reconciling actual columns, constraints, function return types, overloads, grants, owners, or sequences. This is unsafe against the known historical schema.
4. Ready/limited products decrement both product stock and matching variant stock. A missing variant silently falls back to product stock, so invalid size/color combinations can be accepted and stock can be double-counted.
5. Order and custom-design submission have no durable idempotency key. A retry after an ambiguous network result can create a second order/request and consume stock again.
6. Design-reference uploads are anonymous and not bound to a request prefix; the custom-design RPC accepts client-controlled paths/URLs without ownership validation.
7. Public order verification based on the last four phone digits is low entropy, especially with sequential order numbers.
8. The realtime migration catches and ignores publication errors, so it can report success while `orders` is not published.

### Medium priority

- Client catalog, shipping, coupon, and category paths previously displayed local sample data after live failures or empty responses.
- Customer order records previously stored phone, email, address, and other PII in localStorage.
- Tracking had a direct `select('*')` fallback for any authenticated session rather than a server-side admin check and sanitized projection.
- Checkout confirmation and local tracking used browser-computed totals instead of authoritative RPC totals.
- Product detail could remain in a loading state after an unexpected fetch rejection.
- The repository had no runnable test script.
- Storage deletion errors were swallowed and custom-design uploads were not cleaned up on failed submission.

## Implemented on branch

The following non-database changes were implemented and verified:

- Production builds no longer substitute local catalog, shipping, coupon, or category samples when live reads fail; local fallbacks remain available only in development mode.
- Public tracking now requires a phone value before attempting lookup, does not auto-query from an order-number-only URL, and no longer performs a direct browser query of the `orders` table.
- Browser-cached order records are sanitized to remove phone, email, city, address, notes, and admin notes. Cached data is treated only as a non-sensitive convenience list, not as authorization.
- Product detail fetches now clear loading state on every outcome and log unexpected errors.
- Added `npm test` using the existing TypeScript-compatible `tsx` runner.

Changed files:

- `package.json`
- `src/components/SiteShell.tsx`
- `src/lib/api.ts`
- `src/pages/ProductDetail.tsx`
- `src/pages/TrackOrder.tsx`

No migration was created or applied because the live schema and backup prerequisites are unavailable. Creating a speculative migration would violate the project’s data-preservation rules.

## Verification

| Check | Result | Evidence |
|---|---|---|
| TypeScript check | PASS | `npm run lint`, exit 0 |
| Unit tests | PASS | `npm test`, 14 passed, 0 failed |
| Production build | PASS | `npm run build`, exit 0 |
| Live schema inspection | BLOCKED | Publishable key rejected by Supabase Data API |
| Production backup | BLOCKED | No database-secret/backup-capable access available |
| SQL migration application | NOT RUN | Intentionally withheld pending live schema/backup |
| Storage upload/RLS integration test | BLOCKED | Requires authenticated admin and live storage policy access |
| Concurrent stock test | BLOCKED | Requires live RPC/database access and safe test fixtures |
| Admin, customer, and RLS matrix | BLOCKED | Requires live auth accounts and schema access |
| Deployment/preview validation | NOT RUN | No deployment target or publish authorization was changed |

## Required owner action

Provide a database-secret/SQL-editor connection with permission to perform a read-only schema dump and a verified backup, or connect the authorized Supabase project integration. The next safe step is to inspect `pg_proc`, `pg_attribute`, `pg_constraint`, `pg_policies`, storage policies/buckets, sequence values, realtime publication membership, and migration history. Only after that inspection should a compatibility migration be authored and tested against a disposable database copy.

The branch is intentionally not merged and the database is unchanged.
