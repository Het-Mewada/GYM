# CLAUDE.md - Gym Management SaaS Assistant Guide

## Operational Commands
- Install: `pnpm install`
- Dev server: `pnpm run dev`
- Build all packages: `pnpm run build`
- Typecheck all: `pnpm run typecheck`
- Lint: `pnpm run lint`
- Tests: `pnpm run test`
- Format: `pnpm run format`
- Local Docker: `docker compose up -d`
- Stop Docker: `docker compose down`

## Workspace Structure
- `apps/api`: Fastify modular monolith API (/v1, health, auth, billing, attendance)
- `apps/web`: Next.js 15 App Router ((owner), (marketing) route groups)
- `packages/shared`: Zod schemas, constants, types, E.164 phone validation
- `docs/`: Architecture, database schema, progress, decisions
- `docker/`: Docker Compose configuration and Postgres init scripts

## Development Conventions & Invariants
1. **Multi-Tenancy**: Every tenant-owned table MUST contain `gym_id UUID NOT NULL`, have PostgreSQL `FORCE ROW LEVEL SECURITY`, and bind child foreign keys via composite `(gym_id, parent_id)`.
2. **Session Injection**: Session parameters MUST be injected via parameterized `SELECT set_config('app.gym_id', $1, true), set_config('app.user_id', $2, true);`. Never use raw string interpolation.
3. **Database Roles**: Migrations run as `migration_role` (BYPASSRLS). Application connects strictly as `app_user` (NOBYPASSRLS).
4. **Append-Only Ledger**: `payment_transactions` and `audit_logs` are strictly append-only. UPDATE and DELETE are revoked and blocked via PostgreSQL trigger.
5. **Money Handling**: Stored exclusively as `BIGINT` minor units (`amount_cents`). Prices in R1 are tax-inclusive.
6. **Phone Numbers**: Input validated with `libphonenumber-js`, stored in E.164 format with leading `+`. WhatsApp `wa.me` links format phone numbers without the leading `+`.
7. **Single-Name Members**: `first_name` is required; `last_name` is nullable.
8. **Audit Logs**: Never store PII (no names, phones, or emails). Never store IP addresses.
9. **Subscriptions**: Stored statuses are `pending`, `queued`, `active`, `cancelled`. Status `frozen` is derived at query time from active freeze records.
10. **Attendance**: Idempotent on `(gym_id, member_id, attendance_date)`. Duplicate check-ins succeed with HTTP 200 without error.
