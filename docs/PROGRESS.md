# Project Progress Log

## Done
- [x] **Phase 0: Architecture Blueprint & Requirements Validation**
  - Clarified and resolved 10 foundational product inputs (INR currency, Asia/Kolkata timezone, inclusive tax, Resend email, WhatsApp direct click links).
  - Defined composite multi-tenant RLS model, append-only ledger, and state machines.
- [x] **Phase 1: Tooling, Docker, CI, Docs & Test Harness (Closed)**
  - Configured `pnpm` monorepo with Turborepo (`apps/api`, `apps/web`, `packages/shared`).
  - Set up PostgreSQL 16 Alpine container with healthchecks and dynamic role initialization.
  - Pinned Next.js to patched LTS release `15.2.9` with React 19.
  - Built Dockerfiles for `apps/api` and `apps/web`; verified live `/health` endpoints with non-privileged `app_user` database startup assertion.
  - Authored foundational documentation: `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md` (ADR-001 through ADR-008), `docs/DATABASE.md`.
  - Configured test harness with Vitest across all workspace packages.
- [x] **Phase 2 Milestone 1: DDL v5 & Comprehensive Verification Suite**
  - Schema (`scripts/ddl_v5.sql`): Composite FKs, `FORCE ROW LEVEL SECURITY`, immutable ledger triggers, partial attendance unique index, 2-key advisory transaction locks for refund and subscription overlap guards.
  - Roles & Privileges: Dedicated NOLOGIN role `definer_admin` with `BYPASSRLS` owning all 9 SECURITY DEFINER functions with explicit `search_path=public, pg_temp`. API connects strictly as `app_user` (NOBYPASSRLS, NOT superuser).
  - Catalog tests: Verified 100% compliance (all 3 catalog tests return 0 rows).
  - Test suites executed against clean `postgres:16`: Cross-tenant definer rejection, negative privilege tests, IST 00:30 Nov 1st receipt formatter (`REC-202611-000001`), attendance void/re-checkin, revenue and dues calculations, pending->active overlap prevention, and bounded expiring worklist query.
  - Refund concurrency test: Control run (trigger disabled) proved race condition (₹60.00 over-refund); Guarded run (trigger active with 2-key advisory lock) proved serialization (₹30.00 refunded, second attempt rejected).
  - Re-run automation: Committed `scripts/recreate_and_test.ps1` and `scripts/recreate_and_test.sh` runnable from `docker compose down -v`.
  - Raw unedited logs captured and committed in `docs/verification/`.

- [x] **Phase 2 Milestone 2: Drizzle ORM Schema & Parameterized Session Runner**
  - Generated Drizzle schema mirroring DDL v5 (`packages/db/src/schema.ts`).
  - Implemented parameterized `withTenantContext` runner enforcing RLS via `set_config('app.gym_id', ...)`.
  - Added schema drift assertions and automated test coverage.
- [x] **Milestone 2 Hardening (PR A - Merged)**
  - Closed open registration; enforced invite-only / admin-provisioned pilot accounts.
  - Implemented database-backed per-account login throttling (`account_login_attempts`) and timing attack defense via dummy Argon2id hash.
  - Replaced legacy member reset with owner-only `/staff/:userId/reset-password`.
  - Guarded concurrency tests with `try...finally` function restoration and serialized execution.
- [x] **Phase 3 Slice 1: Members Directory End-to-End (PR B - Merged)**
  - Built members list, create, search, and edit APIs with strict tenant isolation.
  - Added single-name support and monotonic member numbering (`MEM-00001`).
  - Enforced unique phone and email constraints per gym (`idx_members_gym_phone_unique`, `idx_members_gym_email_unique`).
  - Delivered responsive members web interface with search/filtering and Playwright journey.
- [x] **Phase 3 Slice 2: Membership Plans & Subscriptions Lifecycle (PR D - Ready for Review)**
  - Built membership plans CRUD (`/api/gyms/:gymId/plans`) with manager/owner RBAC and duration/pricing controls.
  - Built subscription issuance with inclusive calendar arithmetic ($endDate = startDate + duration - 1$).
  - Overlap prevention via PostgreSQL advisory locks returning `409 Conflict`, with automatic sequential queuing.
  - Dedicated Plans page (`/plans`) and Member Subscriptions management modal (`data-testid="subscriptions-modal"`).
  - Multi-tenant tenant-switch authentication flow and full Playwright E2E journey.

- [x] **Phase 3 Slice 3: Payments Ledger, Receipts & Invoicing (PR E - Ready for Review)**
  - Built append-only payment transactions ledger (`payment_transactions`) rejecting `UPDATE` and `DELETE`.
  - Implemented monotonic monthly tax receipt numbering (`REC-YYYYMM-000001`) via PostgreSQL sequence/definer function.
  - Supported inclusive 18% GST calculation, UPI, Cash, Card POS, and Bank Transfer payment modes with idempotency keys.
  - Guarded partial and full refunds with 2-key advisory transaction locking, subscription cancellation semantics (`cancelSubscription: true`), and database trigger over-refund guards.
  - Delivered member financial ledger statement API (`GET /api/gyms/:gymId/members/:memberId/financials`).
  - Added Payments & Invoicing web UI (`/payments`), tax receipt / refund voucher view modals, and full Playwright E2E journey.

## In Progress
- [ ] **Phase 3 Slice 4: Attendance Tracking**
  - Daily check-in / check-out with active subscription verification.
  - Partial unique index enforcement preventing multiple active check-ins per day.
  - Manual voiding / re-checkin controls.
  - Real-time attendance log web view and Playwright journey.

## Blocked
- None.

## Next Up
- Phase 3 Slice 5: CSV Member Importer with transactional batching and validation.
