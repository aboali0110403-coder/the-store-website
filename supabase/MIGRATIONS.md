# Supabase migrations: how this folder relates to the live project

Checked read-only against the live project on 2026-11-24 (snapshot, may drift later).

- `migrations/` holds the 19 migrations recorded as applied on the live project
  (`supabase_migrations.schema_migrations`), with the exact applied statements, plus
  `20261124200000_reconcile_live_schema_drift.sql`. That last file is idempotent and changes nothing on
  the live project; it records objects that exist live but were created outside migration history
  (`store_settings` table and policies, custom design proposal columns and checks,
  `shipping_rates_gov_area_key`).
- `migrations_repo_only/` keeps, unchanged, the earlier repo files that were never applied or whose
  content differs from what was applied (same history in git). They are not part of the live schema
  and must not be run.
- `local-replay-bootstrap.sql` stubs the Supabase roles, `auth` and `storage` pieces so the migrations can be
  replayed in a throwaway local Postgres.

## What was verified (and what was not)

Replay of `migrations/` in order on an empty local Postgres (Supabase stubs, pgcrypto line skipped as the
local build lacks it) succeeds. A catalog comparison against the live project shows the same columns,
constraints, indexes, triggers, RLS flags, public function definitions (whitespace-normalised hash),
and public/storage policies. NOT verified: table data, storage objects, Auth users and settings,
extensions, grants (the API role cannot read them), and the real Supabase `storage`/`auth` internals.
This shows the schema can be rebuilt from this folder. It is not a data backup.

## Gaps this folder does not close (do not claim full rebuildability)

- Extensions live: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp. A new Supabase project
  has these by default; the local replay skipped pgcrypto/uuid-ossp.
- Table and function grants: the live grants were read from the catalog and are not fully produced by these
  migrations. On live, `anon` holds table-level privileges on some tables (for example categories and
  store_settings) that Row Level Security restricts, and the local stub differs on other tables. After a
  restore, re-check grants and RLS against a known-good project rather than trusting this folder.
- Auth users, Auth settings, storage objects and Supabase-internal schemas are not in migrations.

## Restoring app rows (data backup, taken separately and kept private)

A private logical export (JSON rows of every public table, public product images, grants and storage listings)
was taken read-only on 2026-11-24 and stored privately outside this repository because it contains
customer and admin data. Restore test: after replaying `migrations/` into an empty local Postgres, rows were
loaded with `truncate ... cascade` followed by `json_populate_recordset` (migrations seed categories and
shipping rates, so truncate first). Row counts for all 13 tables matched. Not covered: Auth users,
the private `design-references` bucket files (listed by name only), and a full `pg_dump`.

## Data backup (free options only)

The inspected Supabase backups endpoint lists no backups and PITR is off. A free logical backup is
`pg_dump` against the project database (needs the database password and a direct connection), kept
private (it contains customer data once orders exist) and never committed here.
