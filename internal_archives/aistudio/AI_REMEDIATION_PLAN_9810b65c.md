# MERO BOUTIQUE — AI Implementation and Production Readiness Plan

## Mission

When instructed to implement this document, repair the existing application in the execution order below. Deliver working changes and verification evidence, not just recommendations. Preserve the boutique's visual identity, Arabic/English support, and intended commerce behavior.

This document consolidates the production-readiness and performance reviews dated **November 10, 2026**. It is an implementation brief, not a claim that fixes have already been made or that production is currently safe.

**Current release decision: NO-GO for real customer orders.**

Source reports, retained for context:

- [Production readiness audit](AUDIT_REPORT_AR.md): findings A01–A25, using that report's numbered findings.
- [Performance review](PERFORMANCE_REVIEW_AR.md): findings PF01–PF11, using that report's numbered findings.

This brief is self-contained. Source paths and symbols are navigation hints; inspect the current code because line numbers and implementation details may change.

## Operating rules for the implementing AI

1. Inspect the current repository, applicable `AGENTS.md` instructions, migration history, and runtime before making changes. Reproduce findings where practical and update any assumptions contradicted by evidence.
2. Work through the phases in order. Prioritize security, data integrity, and a working migration path before cosmetic work and performance tuning. Independent fixes may proceed when an unrelated environment dependency is blocked.
3. Make focused changes. Keep React, Vite, and Supabase unless a concrete requirement cannot be met with the current stack. Avoid a framework rewrite or unrelated redesign.
4. Preserve server-side price calculation, atomic inventory locking, restricted order access, private design-reference storage, and made-to-order inventory semantics.
5. Exercise migrations and order mutations in an isolated local or staging environment with synthetic data. This document does not authorize production deployment, real orders, customer messaging, destructive resets, or changing production access.
6. Never weaken RLS, expose the orders table, embed service-role credentials, or add demo fallbacks to make a failing test or screen appear functional. Supabase publishable keys are expected in the client; they are not authorization boundaries.
7. Do not treat a client boolean, a phone number supplied by a caller, hidden form fields, or a browser-only rate limiter as trusted verification.
8. Complete authorized local implementation and verification without repeatedly requesting permission for routine reversible work. Record external prerequisites precisely; continue unaffected tasks. Do not invent credentials, contact details, provider configuration, legal approval, or successful checks.
9. Keep the existing audit reports intact. Track implementation progress in a separate `REMEDIATION_STATUS.md` with task ID, status, changed files, checks, and remaining dependencies. Use `pending`, `in_progress`, `verified`, or `blocked`; a code edit without verification is not `verified`.
10. Add regression tests for the critical database/API behavior described below. Avoid tests that merely duplicate implementation details or unnecessary tests for simple asset changes.
11. For new API contracts, update SQL, application types, callers, error handling, and tests together. Do not leave the browser using an obsolete RPC signature.
12. Distinguish confirmed defects from profiling hypotheses. Do not fabricate Lighthouse scores, load capacity, vulnerability results, or Core Web Vitals.

## Audit baseline and limitations

The following results were observed before remediation:

- Normal npm installation failed with an esbuild/Vite peer dependency conflict. Installation with `--legacy-peer-deps` enabled audit checks; that workaround is not an accepted final dependency fix.
- TypeScript checking and the production build passed after that installation.
- The 14 existing commerce-logic tests passed. They do not cover RLS, migrations, RPC integration, or the complete purchase journey.
- Applying the first SQL migration locally succeeded. Applying the second failed on the missing `tracking_token` column. After adding that column in the test database only, a second failure occurred because `lookup_public_order` had multiple signatures and an ambiguous GRANT.
- Local PostgreSQL reproductions confirmed anonymous product-read failure, invalid/inactive variant acceptance, weak tracking verification, exposure of history notes, incomplete server input validation, and missing stock restoration on cancellation.
- These SQL checks used PostgreSQL 18.6 with minimal Supabase role/schema fixtures. They were not a complete Supabase/PostgREST/Realtime environment.
- The deployed website could not be inspected by the audit tools. Its availability, deployed version, visual behavior, HTTP caching, and field performance were not established.
- Current build baseline: main JS **643,385 bytes**, approximately **180 kB gzip**; CSS **72,285 bytes**, approximately **15 kB gzip**. Compression measurements are local, not proof of hosting configuration.
- `public/mero-logo.png` is **2,507,138 bytes**, **1254 × 1254**, typically rendered around **48 × 48 CSS pixels** in the header. It is also referenced as the favicon.

## Execution order

| Order | Phase | Priority | Required outcome |
|---|---|---|---|
| 0 | Reproducible environment | Foundation | Reliable installation, checks, and isolated configuration |
| 1 | Database migrations | Release blocker | Clean install and supported upgrade paths both work |
| 2 | Authorization and tracking privacy | Release blocker | No unauthorized reads, weak tracking bypass, or internal-note exposure |
| 3 | Trusted request and upload boundaries | Release blocker | Direct API access cannot bypass protection |
| 4 | Commerce transactions | Release blocker | Correct variants, totals, retries, inventory, and history |
| 5 | Catalog and operational correctness | High | Honest storefront state and usable administration/support |
| 6 | Performance and discoverability | High / measured follow-up | Smaller initial load, bounded queries, verified improvements |
| 7 | Release verification | Release gate | Evidence-backed readiness decision and deployment handoff |

---

## Phase 0 — Establish a reproducible environment

### F00 — Fix dependency installation and document the workflow

**Covers:** A20 and the audit's missing test/CI workflow.

**Inspect:** `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `src/lib/commerceLogic.test.ts`.

**Implement:**

- Choose and document the intended package manager and supported Node/package-manager versions. The existing Bun lockfile must be considered; do not assume Bun itself was proven broken.
- Resolve the incompatible direct esbuild dependency versus Vite's supported range. Remove an unnecessary direct dependency or select compatible versions after checking the actual toolchain.
- Update the chosen lockfile consistently. Avoid conflicting lockfiles and permanent peer-dependency bypass flags.
- Provide documented scripts for type checking, building, and running the existing tests. `lint` currently runs TypeScript only; label checks accurately.
- Establish meaningful database/API integration checks and CI as the subsequent phases add them.

**Acceptance:** A clean installation using the documented locked workflow succeeds without `--force` or `--legacy-peer-deps`; type checking, build, and the existing tests pass. Document any environment-specific test-runner workaround instead of attributing it to application logic.

### F01 — Isolate environment configuration

**Covers:** production prerequisites and unsafe cross-environment fallback behavior.

**Inspect:** `src/lib/supabaseClient.ts`, `vite.config.ts`, `.env.example`.

**Implement:**

- Require explicit, valid configuration for non-demo environments. Missing staging variables must not silently connect to the hardcoded live Supabase project.
- Support Vite environment loading correctly; do not accidentally override valid configured values with hardcoded fallbacks.
- Keep privileged secrets exclusively in trusted server/Edge Function environments. Validate configuration without assuming substring checks can identify every privileged JWT.
- Document required variables, where they are configured, and which are public versus server-only.

**Acceptance:** Missing or mismatched configuration produces a clear actionable error; local/staging checks cannot write to production by accident. The built client contains no privileged credentials.

## Phase 1 — Repair database installation and upgrades

### DB01 — Fix the complete migration chain

**Covers:** A01, A02.

**Inspect:**

- `supabase/migrations/20261108000000_inventory_storage_and_security.sql`
- `supabase/migrations/20261109050000_corrected_inventory_storage_security.sql`
- `lookup_public_order` calls in `src/lib/api.ts`

**Implement:**

- Add `tracking_token` to existing orders explicitly before creating its index or referencing it in functions. Generate independent random tokens for legacy rows; do not derive them from order numbers, phone numbers, or timestamps.
- Resolve the two-argument and three-argument tracking function overloads deliberately. Remove or restrict obsolete entry points, account for dependencies, and use explicit function signatures in GRANT/REVOKE statements.
- Ensure no public legacy function can return an order without the intended authorization.
- Keep the frontend and PostgREST-visible function contract unambiguous.
- Preserve existing orders and other data. Do not solve migration failure with a database reset.

**Migration sequencing constraint:** A new migration placed after the currently broken migration cannot repair a clean replay that stops at the earlier failure. Inspect actual applied migration history and provide a coherent solution for both clean installs and existing deployments. Correct never-applied migration scripts where appropriate; use explicit repair/preflight steps and forward migrations for deployed history. Document any historical edits and their compatibility implications. Do not silently rewrite applied history or mark failed migrations as applied.

**Acceptance:**

- A clean database applies the documented chain successfully.
- A database at the first-migration state upgrades successfully with existing data preserved.
- A supported repair path exists for any partially/manual-updated state discovered in staging.
- Verify the actual transaction runner behavior; psql partial execution is not proof of deployment behavior.
- Inspect function signatures and privileges, then exercise the intended RPC through PostgREST, not only direct SQL.

### DB02 — Prevent reference truncation and collisions

**Covers:** A25.

**Inspect:** `submit_store_order`, `submit_custom_design_request`, order/reference input validation.

**Implement:** Replace fixed-length `lpad(sequence::text, 4, '0')` formatting with a format that retains every sequence digit. Preserve readable existing references and uniqueness. Ensure validation and tracking support longer references.

**Acceptance:** Boundary checks around 9999, 10000, 10001, and larger values produce distinct references for both order and bespoke sequences. Do not advance production sequences for testing.

## Phase 2 — Correct authorization and tracking privacy

### SEC01 — Repair role-specific RLS without exposing private tables

**Covers:** A03.

**Inspect:** `is_admin()`, table grants, public read policies, admin authorization in `Admin.tsx` and `api.ts`.

**Implement:** Fix the mismatch between anonymous policies and executable function privileges. Prefer clear separate policies for public published data and administrator access, or another verified least-privilege design. Check child image/variant visibility against parent product publication, not just the top-level products policy.

**Acceptance matrix:**

| Role | Must be allowed | Must be denied |
|---|---|---|
| Anonymous visitor | Published catalog data required by the storefront | Private orders, admin users, unpublished catalog, privileged mutations |
| Authenticated non-admin | Public storefront behavior | Administrative reads/writes and private storage access |
| Verified store admin | Intended catalog/order/shipping/coupon administration | Any operations outside the documented store role |

Test policies through the same API used by the browser. A hidden admin screen is not a security test, and any authenticated session must not be treated as an administrator.

### SEC02 — Replace weak tracking authorization and remove legacy bypasses

**Covers:** A06 and tracking portions of A02.

**Inspect:** `lookup_public_order`, `submitStoreOrder`, `lookupPublicOrder`, `Checkout.tsx`, `TrackOrder.tsx`.

**Implement:**

- Use a high-entropy tracking token or a properly verified OTP-based flow. Full phone knowledge alone is not proof of possession; last-four-digit matching is insufficient.
- Return and use the authorized tracking capability throughout checkout confirmation, links, tracking requests, and refresh behavior.
- Protect tokens from unnecessary analytics/logging/referrer exposure. Document retention and recovery behavior; do not put customer phone/address in tracking URLs.
- Return a deliberately narrow public response type instead of casting it to the full private `Order` type.
- Return generic failures for unknown references, missing/wrong capabilities, and unauthorized requests.

**Acceptance:** Order number alone, no phone, short phone, last-four-digit guesses, and obsolete signatures cannot retrieve data. Valid authorization works on another browser without access to the original browser's cached customer data. Tokens for one order cannot authorize another.

### SEC03 — Separate internal notes from public history

**Covers:** A07.

**Inspect:** `adminUpdateOrderStatus`, `order_status_history`, tracking RPC projections.

**Implement:** Store internal notes separately from explicitly public customer messages. Default unclassified legacy notes to private; do not backfill every historical note as public. Public RPCs must select only approved fields.

**Acceptance:** A uniquely marked internal test note never appears in public JSON, tracking UI, or shared/exported customer output. An explicitly public status message appears as intended. Admins retain access to internal notes.

### SEC04 — Make tracking freshness and local persistence honest

**Covers:** A17, A18, A24.

**Inspect:** `TrackOrder.tsx`, `lookupPublicOrder`, `saveCustomerOrder`, `getCustomerOrders`.

**Implement:**

- Replace the incompatible anonymous subscription to the private orders table with authorized polling or a properly authorized minimal event channel.
- Do not broaden table SELECT access to make Realtime work.
- If polling is used, bound its interval, pause when appropriate, clean up timers, and back off on errors.
- Distinguish live, cached, offline, and not-found results. A local cache must not bypass authorization or be labeled as refreshed from the server.
- Stop persisting complete customer contact/address data unnecessarily. Prefer minimal order references and required capabilities, with expiry and a clear local-data deletion option. Account for previously stored payloads.

**Acceptance:** Guest status changes propagate through the chosen authorized mechanism. Network failure shows stale/offline state with the actual last successful synchronization time. Shared-device data is minimized, expired entries are removed, and old private cache payloads are handled.

## Phase 3 — Enforce trusted request and upload boundaries

### SEC05 — Enforce anti-abuse checks outside the browser

**Covers:** A05.

**Inspect:** `CaptchaChallenge.tsx`, `checkGuestRateLimit`, guest order/design submission RPCs, tracking entry points.

**Implement:**

- Choose a trusted server or Supabase Edge Function entry point for verification and abuse controls, or an equivalently enforceable database/gateway design.
- If using a CAPTCHA provider, verify its proof on the trusted side and enforce expiry/reuse rules. Keep secret verification keys server-only.
- Add server-enforced request limits and payload limits. Use trusted identifiers where available; a user-supplied phone or forwarded header alone is not reliable identity.
- Close the bypass: if a protected endpoint calls a privileged RPC, anonymous clients must not still be able to invoke an unprotected equivalent directly.
- Keep legitimate guest checkout supported. Provide meaningful retry errors.

**Acceptance:** Direct API/RPC calls, fresh tabs, page reloads, and fabricated client booleans do not bypass protection. Missing/invalid verification and exceeded limits fail before order creation or stock mutation. Verify actual provider/gateway configuration in staging; mocked verification alone is insufficient for release.

### SEC06 — Validate and constrain all submitted data server-side

**Covers:** A14.

**Implement:** Validate required address/area fields, supported shipping destinations, payment method allowlists, item types and counts, integer quantities, text lengths, optional email/date/budget values, and reference limits at the trusted boundary. Apply database constraints where they protect invariants across all writers. Keep client validation for usability.

**Acceptance:** Empty addresses, unknown payment methods, malformed/non-array items, unsupported destinations, overlarge payloads, and invalid quantities fail with actionable errors and no partial writes. A client cannot mark a payment as verified.

### SEC07 — Restrict guest uploads and clean up abandoned files

**Covers:** A13 and PF11.

**Inspect:** storage policies, `uploadDesignReferenceImage`, `deleteStorageFile`, `CustomDesign.tsx`.

**Implement:**

- Associate uploads with a bounded, verified temporary request/session and enforce file count, size, allowed content, ownership, expiry, and total usage limits on the trusted side.
- Validate submitted reference paths against that ownership; accepting an arbitrary path is not proof the caller owns the object.
- Keep design references private and admin viewing authorized with short-lived signed URLs.
- Allow removal only through a properly authorized owner flow or trusted cleanup service; do not grant all guests broad DELETE privileges.
- Detect Supabase `{ error }` results, report failed operations correctly, and schedule bounded cleanup for abandoned/orphaned files.
- Release preview object URLs on removal/replacement/unmount without breaking active previews.

**Acceptance:** Unverified uploads, cross-request access, excess files, and unsupported/oversized content fail. Authorized images remain visible only to intended users. Abandoned uploads are removable, deletion errors are observable, and preview URLs are released.

## Phase 4 — Make commerce operations correct and atomic

### COM01 — Validate variants and preserve stock invariants

**Covers:** A04.

**Inspect:** order RPC, `product_variants`, `ProductDetail.tsx`, Home/Shop quick-add behavior, cart operations.

**Implement:**

- Define consistent rules for products with variants and products without them. Reject nonexistent/inactive size-color combinations at the trusted boundary; prefer a stable variant ID when appropriate.
- Validate allowed selections for made-to-order products too, while preserving their intended lack of ready-stock decrement.
- Disable impossible combinations and prevent quick-add from choosing an unavailable default.
- Preserve transaction locks and prevent overselling across concurrent requests, repeated cart lines, and combined quantities. Document how aggregate product stock and variant stock stay consistent.

**Acceptance:** Invalid/inactive selections fail; valid ready/limited items decrement stock exactly once; made-to-order items follow documented behavior. Simultaneous attempts for the last available unit cannot both succeed. A failed order leaves no partial stock changes or orphaned order records.

### COM02 — Make totals and coupon decisions authoritative

**Covers:** A08, A09.

**Inspect:** `Checkout.tsx`, `commerceLogic.ts`, coupon APIs, shipping configuration, submission RPC return values.

**Implement:**

- Return typed server-calculated subtotal, shipping, discount, total, and necessary confirmation data. Render the saved receipt from that response.
- Use an explicit coupon field instead of parsing customer notes for `[Applied Coupon: ...]`.
- Provide narrow server-side coupon evaluation without exposing the coupon table. Remove production hardcoded promotion fallbacks.
- Recompute validity and discount after cart changes and at final submission, including active/expired/minimum-value rules and consistent currency rounding.
- Reject unsupported shipping destinations or disclose a verified configured fee before confirmation; do not display zero and silently charge a fallback fee.
- Handle price/rate/coupon changes between preview and submission explicitly. Where customer reconfirmation is needed, return a revised quote before committing an unexpected amount.

**Acceptance:** UI receipt, stored order, item prices, and server response agree. Admin-created coupons work; disabled, deleted, expired, or insufficient-subtotal coupons fail consistently. Test changed prices, changed shipping rates, cart updates, and unavailable destinations. Client-supplied prices/discounts cannot control charged totals.

### COM03 — Make retries idempotent

**Covers:** A11.

**Implement:** Introduce a high-entropy stable checkout attempt key with database uniqueness and transactionally safe handling. Reuse it for retries of the same attempt. Bind it to the request identity/payload appropriately; reject conflicting reuse and do not expose another caller's order data. Apply equivalent duplicate protection to bespoke submissions where appropriate.

**Acceptance:** Two concurrent identical submissions create one order and one inventory change. A committed request followed by a lost response and retry returns the original result. Reusing a key with a changed cart or customer payload is handled explicitly rather than silently creating or returning the wrong order.

### COM04 — Make status changes, inventory restoration, and history atomic

**Covers:** A12, A15.

**Inspect:** `adminUpdateOrderStatus`, admin status controls, inventory and history schema.

**Implement:**

- Define allowed state transitions and cancellation/restock policy. Use documented conservative defaults for reversible pending/confirmed cancellations; identify any business-dependent post-production/post-shipping rules explicitly.
- Use a transaction/RPC or equivalent trigger design for state change, inventory adjustment, and history insertion.
- Restore applicable ready/limited stock at most once; do not incorrectly restock made-to-order garments or physically unreturned shipped goods.
- Record the authenticated actor from trusted auth context and separate internal/public messages.
- Prevent duplicate/concurrent updates from producing duplicate restoration or contradictory history.

**Acceptance:** Valid cancellations restore applicable stock exactly once. Repeated/concurrent cancellation does not inflate stock. Invalid transitions fail. A history failure rolls back the related change. Authorized admin actions record the real actor; non-admins cannot perform them.

## Phase 5 — Make the storefront and administration reliable

### OPS01 — Remove misleading production fallbacks

**Covers:** A10.

**Inspect:** catalog/product/shipping/category APIs, `store.ts`, provider initialization.

**Implement:** Separate loading, successful-empty, error, cached, and explicit demo states. Demo products/promotions must not silently replace unavailable production data. Prevent checkout when authoritative sale data cannot be established. Keep deliberate caching bounded and distinguish it from a verified live result.

**Acceptance:** An empty published catalog shows a genuine empty state. A backend outage shows an error/retry state. Unpublished/deleted items do not reappear as fallback products. Existing carts with removed products are explained to the customer rather than silently dropping items at checkout.

### OPS02 — Use one dynamic category model and correct newest sorting

**Covers:** A19.

**Inspect:** category schema, `mapProductRow`, Shop filters, navigation, admin category editing/deletion.

**Implement:** Use stable category IDs/slugs consistently instead of converting unknown categories to `Exclusive Pieces`. Populate filters/navigation from the same published source. Preserve category-product relationships during edits and enforce deletion/reassignment integrity on the database side. Carry a real creation timestamp for newest sorting.

**Acceptance:** A newly added category can contain products and works from homepage link through listing and details. Renaming/hiding a category behaves consistently. Newest sorts by creation time, not publication boolean. Existing categories remain mapped correctly after migration.

### OPS03 — Make old orders and bespoke requests accessible

**Covers:** A16.

**Implement:** Add stable server-side pagination, useful search/filter controls, loading/error states, and bounded payloads for admin orders and design requests. Keep all access subject to admin authorization.

**Acceptance:** Seed more than 100 records and retrieve old records through the UI. Navigate pages without missing/duplicating records due to unstable ordering. Search is not restricted to the currently loaded page.

### OPS04 — Connect real support and subscription flows

**Covers:** A23.

**Inspect:** Home newsletter, SiteShell social/email links, tracking WhatsApp links, store environment configuration.

**Implement:**

- Replace the newsletter success alert with a real confirmed persistence/provider result and honest failure behavior. If no service is configured, hide/disable the subscription action with clear messaging instead of claiming success.
- Connect WhatsApp to the actual configured business number, Instagram to the store profile, and email to a verified business address.
- Do not invent contact details or send test communications to real customers. Validate links without sending messages.

**Acceptance:** Subscription success corresponds to a real accepted operation in a test environment; missing configuration cannot produce false success. Support links resolve to configured business destinations and preserve Arabic/English usability.

## Phase 6 — Improve performance using measurements

Capture a comparable baseline before relevant changes. Address the tasks below in order, but coordinate data-fetching changes with Phase 5 to avoid duplicate rewrites. These are optimization requirements; they are not proof of poor measured Core Web Vitals in the deployed site.

### PERF01 — Resize the logo and separate the favicon

**Covers:** A21, PF01.

**Inspect:** `public/mero-logo.png`, all logo references, `index.html`, logo CSS.

**Implement:** Produce correctly sized logo assets for actual display/DPR needs and a separate small favicon. Preserve the design and transparency. Reuse an existing SVG only if its appearance matches the approved logo. Do not substitute a different brand mark merely because it is smaller.

**Acceptance:** Visual comparison passes at mobile/desktop sizes and high DPR. The 2.51MB source is no longer fetched for a small header logo or favicon. Record before/after dimensions, bytes, and browser requests; repeated use of one URL must not be falsely counted as multiple downloads.

### PERF02 — Split routes and measure the initial load

**Covers:** A21, PF02.

**Inspect:** `src/App.tsx`, production build output.

**Implement:** Introduce route-level dynamic imports with appropriate Suspense/loading and chunk-error behavior, starting with Admin, CustomDesign, TrackOrder, and Checkout. Keep shared code reuse sensible; do not split every small component.

**Acceptance:** Opening Home does not request the Admin route chunk. Every route loads through direct navigation and client navigation. Record total initial-route JS transfer/execution cost, not just the size of a renamed entry file. Build and journey checks pass.

### PERF03 — Bound and localize data fetching

**Covers:** PF03, PF04, PF05, PF06; overlaps A16 and A21.

**Inspect:** `SiteShell.tsx`, `api.ts`, Home, Shop, ProductDetail, Admin.

**Implement:**

- Fetch only featured summaries needed by Home. Use bounded product-list queries and appropriate server-side pagination/filter/search as catalog size grows.
- Select explicit columns. Fetch full galleries and variants for product details or another demonstrated requirement, not every application page.
- Do not fetch the catalog/shipping on policies and tracking routes unless an actual interaction requires it.
- Let independent results render independently; shipping response time must not gate catalog updates.
- Deduplicate/cache product detail requests by slug and remove refetches caused only by unrelated catalog updates. Prevent stale in-flight responses from overwriting the current product.
- Load admin data by active task/tab and decouple selectedProductId from loading all six datasets. Invalidate only relevant cached data after mutations.

**Acceptance:** Document a network request matrix for Home, Shop, product detail, policies, tracking, checkout, and Admin. Policy/tracking entry does not load the whole catalog. Product/catalog updates do not cause duplicate unnecessary detail calls. Changing the selected admin product does not refetch orders, coupons, shipping, and bespoke requests. Pagination remains correct with representative data volumes.

### PERF04 — Optimize images and fonts without harming first paint

**Covers:** PF07, PF09.

**Implement:**

- Provide appropriate product image sizes and responsive selection; use offscreen lazy loading where appropriate.
- Identify the actual LCP element before prioritizing it. Do not lazy-load the LCP image. Ensure layout space remains reserved; existing aspect-ratio rules are useful and should be preserved.
- Review image upload/derivative behavior so a permitted 5MB upload does not become the default thumbnail payload.
- Audit used fonts/weights and consider WOFF2/subsets while preserving Arabic glyph coverage. Preserve existing useful font-display and preconnect behavior.

**Acceptance:** No visual/Arabic text regressions. Mobile receives appropriately sized images. Offscreen content is deferred without delaying the LCP resource. Report actual transferred image/font bytes and compare stable repeated measurements.

### PERF05 — Profile rendering and SQL before deeper optimization

**Covers:** PF08, PF10; preview-memory cleanup is handled in SEC07.

**Implement:**

- Use React Profiler to inspect cart/wishlist changes. Split contexts by responsibility/update frequency and stabilize values/functions where measured rerender cost warrants it. Do not scatter memoization without evidence.
- Inspect tracking and other meaningful queries with realistic staging data and `EXPLAIN (ANALYZE, BUFFERS)` where safe. Normalize lookup values or add matching expression indexes when justified; raw-column indexes do not necessarily serve `upper(trim(column))` predicates.
- Investigate trusted API latency, inventory-lock contention, query counts, and payload sizes before claiming capacity improvements.

**Acceptance:** Record relevant before/after traces or query plans. Critical UI interactions stay correct. Index changes are justified by query shape and workload; no unsupported requests-per-second claim is made.

### WEB01 — Add page-specific metadata and discoverability support

**Covers:** A22.

**Inspect:** `index.html`, product pages, route rendering/deployment.

**Implement:** Add truthful per-page title/description, canonical URLs, absolute social image URLs, Product structured data where valid, and a sitemap reflecting published routes/products. Evaluate prerendering/server rendering only if needed to make public metadata visible to target crawlers/share previews. Do not expose private admin/order/tracking data in metadata or sitemaps.

**Acceptance:** Verify generated/served HTML and target share previews, not only client-side DOM changes. Product data matches authoritative store content. Private tracking capabilities never enter indexing artifacts.

## Phase 7 — Verify release readiness

### REL01 — Required regression scenarios

Provide reproducible commands, fixtures, and results for the following critical scenarios. Use an isolated Supabase-compatible environment for RLS/PostgREST/storage behavior where plain PostgreSQL fixtures are insufficient.

- [ ] Clean migration replay and upgrade with legacy data.
- [ ] Explicit RPC signatures/privileges; obsolete tracking bypasses unavailable.
- [ ] Anonymous, authenticated non-admin, and admin authorization matrix.
- [ ] Public tracking cannot expose internal notes or private order fields.
- [ ] Valid tracking from another device; wrong/missing token and guessing blocked.
- [ ] Direct guest API/RPC and upload abuse controls cannot be bypassed.
- [ ] Valid/invalid/inactive variants, made-to-order behavior, and concurrent final-stock requests.
- [ ] Server totals, shipping, coupons, and cart changes remain consistent.
- [ ] Lost-response retry and simultaneous duplicate submissions produce one logical order.
- [ ] Cancellation and concurrent status updates preserve inventory/history invariants.
- [ ] Empty catalog, unavailable backend, stale cache, and removed cart items are handled honestly.
- [ ] More than 100 admin records remain reachable.
- [ ] Product/category changes propagate consistently through navigation and filters.
- [ ] Arabic/English, mobile/desktop, direct route entry, and full checkout/tracking journeys pass.
- [ ] Type checks, existing/new relevant tests, production build, and chosen dependency audit run; unresolved advisories or unavailable checks are reported accurately.

### REL02 — Performance measurement and budgets

- Measure Home, Shop, a product page, and Checkout on a representative mobile device/profile and constrained network. Record browser/tool versions, conditions, sample count, and cold/warm cache results.
- Use Lighthouse and browser traces for diagnostics. Distinguish lab measurements from real-user results; do not label lab TBT as field INP.
- Good Core Web Vitals targets at the **75th percentile**, separately for mobile and desktop, are **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1**. Field results require sufficient real traffic or a valid RUM dataset. Lack of CrUX data is not a pass or an automatic failure.
- Establish explicit project budgets for initial-route JS, image payloads, request counts, and API latency using the measured baseline. Record the chosen budgets and rationale; do not invent mandatory universal limits.
- Inspect actual deployed compression, cache-control, CDN behavior, and routing. Local gzip sizes do not establish transfer sizes on the host. Cache public assets appropriately without accidentally caching private order responses.
- Run any load test only against an authorized non-production environment with synthetic data. Report concurrency, error rates, p95 latency, and bottlenecks alongside throughput.

References: [Google Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals), [PageSpeed Insights methodology](https://developers.google.com/speed/docs/insights/v5/about), [React lazy](https://react.dev/reference/react/lazy), [image priority guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/optimize-image-priority).

### REL03 — Deployment and operational handoff

Prepare a concrete deployment/runbook covering:

- Migration ordering, backup and restore verification, compatibility, and recovery steps. Restoring data and rolling back code are different operations; do not assume a schema rollback is safe.
- Separate staging/production configuration and the chosen trusted API/Edge Function deployment.
- Actual admin authorization and account protections; verify relevant Supabase settings rather than assuming they exist.
- Monitoring for application errors, failed orders, API/storage abuse, and failed cleanup, with private data and tracking tokens excluded from unnecessary logs.
- Verified support channels and business content; privacy/retention disclosures consistent with actual data processing. Do not claim legal compliance without appropriate review.
- Observed hosting security/caching headers and any missing external configuration.

## Completion and reporting contract

At each phase boundary, update `REMEDIATION_STATUS.md` with concise evidence. Continue to the next unblocked task; do not stop after writing a plan or fixing only the easiest issues.

Final delivery must include:

1. A task-by-task status linked to changed files and relevant migrations.
2. Exact checks performed and their outcomes, including failures or unavailable external checks.
3. Before/after performance measurements with conditions and limitations.
4. Any remaining business decisions, provider configuration, or deployment work with precise next actions.
5. An explicit **GO / NO-GO** recommendation supported by the evidence.

Do not mark the application production-ready while security/data-integrity blockers remain, migrations cannot be replayed/upgraded, or critical integrations are only mocked. A green build, passing unit tests, a smaller bundle, or completion of this checklist without actual evidence is insufficient.

## Coverage map

Every original finding must be accounted for. Combining overlapping findings into one implementation task is intentional.

| Original findings | Implementation task |
|---|---|
| A01, A02 | DB01, SEC02 |
| A03 | SEC01 |
| A04 | COM01 |
| A05 | SEC05 |
| A06 | SEC02 |
| A07 | SEC03 |
| A08, A09 | COM02 |
| A10 | OPS01 |
| A11 | COM03 |
| A12, A15 | COM04 |
| A13 | SEC07 |
| A14 | SEC06 |
| A16 | OPS03, PERF03 |
| A17, A18, A24 | SEC04 |
| A19 | OPS02 |
| A20 | F00 |
| A21 | PERF01–PERF04 |
| A22 | WEB01 |
| A23 | OPS04 |
| A25 | DB02 |
| PF01 | PERF01 |
| PF02 | PERF02 |
| PF03, PF04, PF05, PF06 | PERF03 |
| PF07, PF09 | PERF04 |
| PF08, PF10 | PERF05 |
| PF11 | SEC07 |
| Environment and operational prerequisites | F01, REL01–REL03 |
