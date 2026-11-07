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

## In Progress
- [ ] **Phase 2 Milestone 2: Drizzle ORM Schema & Parameterized Session Runner**
  - Generate Drizzle schema files mirroring DDL v5.
  - Implement parameterized `set_config('app.gym_id', ...)` transaction runner in `@gym/api`.

## Blocked
- None.

## Next Up
- Auth module: Argon2id hashing, dual-token JWT issuance, rotating refresh tokens with reuse detection.
- Tenant provisioning API (`POST /api/auth/register` and `POST /api/tenants`).
