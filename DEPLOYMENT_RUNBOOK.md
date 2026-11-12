# MERO BOUTIQUE — PRODUCTION DEPLOYMENT RUNBOOK
**Document Version:** 1.0.0  
**Target Environment:** Staging & Production (Supabase Project `pvvsvxdqjguemptocvcs`)  
**Target Platform:** Node.js 20+ / Vite SPA + Supabase Postgres Database & Storage  

---

## 1. Architectural Overview & Boundaries

The Mero Boutique web application is built on:
- **Frontend:** React 19 SPA bundled with Vite, styled with Tailwind CSS, supporting bilingual English/Arabic with native RTL layout.
- **Backend Services:** Supabase Postgres, GoTrue Auth, PostgREST APIs, and Supabase Storage.
- **Core Security Boundary:** PostgreSQL Row Level Security (RLS) and `SECURITY DEFINER` RPC functions with strict `search_path = public, auth, extensions`.
- **Client Key Model:** The browser only ever possesses the public `VITE_SUPABASE_ANON_KEY`. The `service_role` secret must NEVER be embedded or transmitted to client browsers.

---

## 2. Environment Variables Configuration

Create a `.env` file in the application root or configure your hosting provider (e.g. Vercel, Netlify, Cloudflare Pages, Docker):

```ini
# Supabase Configuration
VITE_SUPABASE_URL=https://pvvsvxdqjguemptocvcs.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional Custom Domain / Base URL
VITE_SITE_URL=https://meroboutique.com
```

### Environment Verification Checklist:
- [ ] `VITE_SUPABASE_URL` points to the target environment project URL.
- [ ] `VITE_SUPABASE_ANON_KEY` is the standard **Anon Public Key**, not the Service Role Secret.
- [ ] No private database connection strings (`postgresql://...`) or API tokens are checked into version control.

---

## 3. Database Migration Runbook

### 3.1 Migration Artifact
- **File:** `supabase/migrations/20261110070000_production_hardening_and_stabilization_revised.sql`
- **Safety Standard:** Zero `DROP FUNCTION ... CASCADE`. Idempotent definitions (`CREATE IF NOT EXISTS`, `ALTER ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`). Non-destructive sequence advances using `setval()`.

### 3.2 Pre-Flight Database Verification
Before running the migration against a live database:
1. **Take an instantaneous snapshot backup** of the Supabase database via Supabase Dashboard -> Settings -> Database -> Backups.
2. Confirm the database user role has `postgres` or administrative privileges to create extensions and execute DDL.
3. Verify existing sequences or high-water order numbers:
   ```sql
   SELECT MAX(CASE WHEN order_number ~ '^MERO-[0-9]+$' THEN SUBSTRING(order_number FROM 6)::bigint ELSE 0 END) FROM public.orders;
   ```

### 3.3 Execution Steps
Apply the migration using the Supabase CLI, GitHub Actions workflow, or Supabase SQL Editor:
```bash
# Via Supabase CLI (linked project)
supabase db push

# OR execute directly in Supabase SQL Editor
# Paste contents of supabase/migrations/20261110070000_production_hardening_and_stabilization_revised.sql
```

### 3.4 Post-Migration Verification Queries
Run these queries immediately after execution to verify database health:

```sql
-- 1. Verify sequences exist and are initialized above current max
SELECT last_value, is_called FROM public.order_number_seq;
SELECT last_value, is_called FROM public.bespoke_request_seq;

-- 2. Verify RPC functions have correct signatures
SELECT proname, prorettype::regtype, prosrc 
FROM pg_proc 
WHERE proname IN ('submit_store_order', 'submit_custom_design_request', 'lookup_public_order');

-- 3. Verify RLS is active on core tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'order_status_history', 'admin_users', 'products', 'categories');
```

---

## 4. Bootstrapping Initial Store Administrators

To authorize a boutique manager to access the `/admin` portal:

1. Have the administrator register or sign up via Supabase Auth (or create user in Supabase Dashboard -> Authentication -> Users).
2. Note the user's `UUID` (e.g. `c4b18c02-45e3-4d7a-8f6a-932d0115bc21`).
3. Insert the UUID into the `public.admin_users` table:
   ```sql
   INSERT INTO public.admin_users (user_id, role)
   VALUES ('c4b18c02-45e3-4d7a-8f6a-932d0115bc21', 'admin')
   ON CONFLICT (user_id) DO NOTHING;
   ```
4. Confirm access by querying:
   ```sql
   SELECT * FROM public.admin_users WHERE user_id = 'c4b18c02-45e3-4d7a-8f6a-932d0115bc21';
   ```

---

## 5. Rollback & Disaster Recovery Strategy

### 5.1 Schema Rollback vs Code Rollback
- **Do not roll back schema if customer orders have been placed under the new schema.** Restoring an old database backup will destroy newly placed orders.
- The revised migration `20261110070000_production_hardening_and_stabilization_revised.sql` is **backward-compatible** with earlier frontend code because it preserved the exact return type signatures `TABLE(...)` and live column names.
- If frontend issues arise, deploy the previous commit of the frontend web application without rolling back the database.

### 5.2 Emergency Sequence Reset (If Sequence Conflicts Occur)
If an order number collision occurs:
```sql
SELECT setval('public.order_number_seq', (SELECT MAX(SUBSTRING(order_number FROM 6)::bigint) + 10 FROM public.orders WHERE order_number ~ '^MERO-[0-9]+$'), true);
```

---

## 6. Storage Buckets Configuration

Ensure the following buckets are configured in Supabase Storage:
1. `product-images`: **Public**. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`. Size limit: 5MB.
2. `design-references`: **Private**. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`. Size limit: 5MB.

Both bucket configurations are automated in Section 9 of the migration script.

---

## 7. Monitoring & Operational Health Checks

1. **Order Sequence Progression:** Ensure orders increment monotonically (`MERO-1001`, `MERO-1002`...).
2. **Order Status Updates:** Verify status changes made in Admin append to `order_status_history` with the admin's `UUID`.
3. **Storage Quota:** Monitor `design-references` storage bucket usage; schedule periodic purging of unreferenced uploads older than 90 days.
4. **Client Error Rate:** Monitor browser console error reports and CDN 4xx/5xx status rates.
