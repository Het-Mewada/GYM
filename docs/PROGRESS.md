# Project Progress Log

## Done
- [x] **Phase 0: Architecture Blueprint & Requirements Validation**
  - Clarified and resolved 10 foundational product inputs (INR currency, Asia/Kolkata timezone, inclusive tax, Resend email, WhatsApp direct click links).
  - Defined composite multi-tenant RLS model, append-only ledger, and state machines.
- [x] **Phase 1: Tooling, Docker, CI, Docs & Test Harness**
  - Configured `pnpm` monorepo with Turborepo (`apps/api`, `apps/web`, `packages/shared`).
  - Set up PostgreSQL 16 Alpine container with healthchecks and dynamic role initialization.
  - Set up GitHub Actions CI workflow (lint, typecheck, postgres service, test suite, build).
  - Authored foundational documentation: `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/DATABASE.md`.
  - Configured test harness with Vitest across all workspace packages.

## In Progress / Awaiting Review
- [ ] **DDL v3 Review & Sign-Off (Gate for Phase 2)**
  - Review composite foreign key structure and RLS policy catalog tests.
  - Review SECURITY DEFINER bootstrap functions (`provision_gym`, `claim_staff_invitation`, `generate_next_receipt_number`).
  - Review ledger rules, opening balance support, and PII-free audit logs.

## Blocked
- None. Phase 2 Drizzle schema generation and migration creation will start upon DDL v3 approval.

## Next Up (Phase 2)
- Generate Drizzle schema files and execute initial migration.
- Implement parameterized `set_config` transaction runner.
- Implement Argon2id auth bootstrap and token rotation in `refresh_tokens`.
- Build the automated Cross-Tenant Isolation test suite (URL paths + request bodies).
