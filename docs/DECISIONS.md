# Architectural Decision Records (ADRs)

## ADR-001: Modular Monolith on Fastify v5
- **Context**: Need a backend API with high throughput, minimal overhead, strong schema validation, and rapid startup in a monorepo.
- **Decision**: Select Fastify v5 over NestJS. Fastify provides a lightweight plugin system, native JSON Schema / Zod serialization, and low memory overhead without requiring complex dependency injection decorators.
- **Consequences**: Standardized plugin-based module architecture with fast local test execution.

## ADR-002: Drizzle ORM for Direct SQL and RLS Integration
- **Context**: The database relies on PostgreSQL transaction session variables (`SET LOCAL` / `set_config()`) to enforce Row Level Security per query.
- **Decision**: Adopt Drizzle ORM over Prisma. Drizzle compiles directly to standard SQL, provides typed query construction without an intermediate binary engine, and allows seamless control over PostgreSQL transaction handles.
- **Consequences**: Zero ORM runtime overhead and clean transaction scoping for `set_config('app.gym_id', ...)`.

## ADR-003: PostgreSQL-Backed pg-boss Queue over Redis/BullMQ
- **Context**: Background reminders, expiry notifications, and unfreeze checks need asynchronous queuing.
- **Decision**: Use `pg-boss` backed by the existing PostgreSQL database for R1.
- **Consequences**: Avoids provisioning, monitoring, and paying for a separate Redis cluster. Redis will only be introduced if job volume exceeds PostgreSQL transactional throughput limits (>5,000 jobs/sec).

## ADR-004: Multi-Tenancy via Shared Schema, Composite Keys and RLS
- **Context**: Gyms must be strictly isolated. Application-only `WHERE gym_id = ?` checks are prone to developer omissions.
- **Decision**: Enforce isolation at the database layer with PostgreSQL `FORCE ROW LEVEL SECURITY` on all tenant tables, paired with composite foreign keys `(gym_id, parent_id)`.
- **Consequences**: A tenant can never query or manipulate another tenant's rows, even in the event of an application logic bug.

## ADR-005: Append-Only Financial Ledger and Minor-Unit Currency
- **Context**: Payment amounts and historical receipts require 100% auditability and tax compliance.
- **Decision**: Financial rows in `payment_transactions` are immutable (enforced via database role `REVOKE` and a PostgreSQL trigger). All monetary values are represented as `BIGINT` minor units (`amount_cents`). Corrections and refunds are recorded as new signed entries.
- **Consequences**: Eliminates floating-point inaccuracies and guarantees an immutable financial audit trail.

## ADR-006: Dual-Token Authentication with Rotating Refresh Cookies
- **Context**: Need stateless, secure authentication for gym staff across desktop and tablet interfaces.
- **Decision**: Issue 15-minute access JWTs in memory/headers and 7-day rotating refresh tokens stored in `httpOnly`, `Secure`, `SameSite=Lax` cookies. On each refresh, user gym membership status is re-verified, and old refresh tokens are invalidated with reuse detection.
- **Consequences**: Prevents token replay attacks and guarantees instant deactivation of revoked staff.

## ADR-007: Unified Single-Origin Reverse Proxy Deployment Topology
- **Context**: Cross-origin cookies between distinct subdomains (`api.gym.com` and `app.gym.com`) face strict third-party cookie restrictions and CORS preflight latency.
- **Decision**: Route traffic through a unified reverse proxy (Caddy / Next.js rewrites) on a single origin, dispatching `/api/*` to Fastify and all other routes to Next.js.
- **Consequences**: Enables first-party cookies with zero CORS overhead and simplified SSL management.

## ADR-008: SQL Migrations as Source of Truth & Database Connection Assertions
- **Context**: ORM-driven schema generation often misses subtle engine-level security mechanisms such as Row Level Security (RLS), advisory locks, custom partial unique indexes, and grant revocations. Additionally, if the API accidentally connects using a superuser account, RLS is completely bypassed.
- **Decision**: Raw SQL migrations are the absolute source of truth for the database schema. Drizzle ORM introspection is used solely for generating TypeScript interfaces verified against the active schema in CI. Furthermore, the API connection pool executes an immutable startup assertion:
  ```sql
  SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
  ```
  If `rolsuper = true` or `rolbypassrls = true`, the application process terminates immediately with a critical security violation.
- **Consequences**: Guarantees that the application always executes strictly within the non-privileged `app_user` sandbox and that no code deployment can silently bypass RLS.

## ADR-009: Database-Enforced Role Authorization for Privileged Procedures
- **Context**: Relying exclusively on API route handlers or middleware for role-based authorization (e.g., verifying whether an authenticated user is an 'owner', 'manager', or 'staff' before performing sensitive mutations like voiding attendance, modifying tenant settings, or claiming invites) creates severe risk: if route middleware is omitted, routing reconfigured, or an API defect occurs, unauthorized mutations could execute.
- **Decision**: Privileged operations executed via `SECURITY DEFINER` database procedures enforce role authorization inside the database function itself. Functions like `void_attendance_record` query `user_gym_memberships` for `(gym_id, NULLIF(current_setting('app.user_id', true), '')::uuid)` and explicitly require `role IN ('owner', 'manager')`, raising an exception if unauthorized (`staff` or unlinked callers).
- **Consequences**: Provides single-source-of-truth authorization directly at the data boundary. The database role `app_user` cannot perform administrative mutations even if the calling application layer fails to check permissions.

## ADR-010: Database-Backed Login Throttling & Closed Open Registration for Pilot
- **Context**: In-memory login rate limiters lose counter state upon process restart and fail across distributed horizontally-scaled API replicas. Furthermore, overly aggressive per-IP throttlers lock out busy shared front-desk gym routers. Finally, open self-registration invites spam and unverified account creation during early pilots.
- **Decision**: Persist login attempt counters in the PostgreSQL database in `account_login_attempts`, accessed strictly via SECURITY DEFINER functions (`auth_record_failed_login`, `auth_is_account_locked`, `auth_clear_account_lockout`). Configure per-IP throttling generously (300 req / 15 min) while enforcing strict 5-attempt / 5-minute per-account lockouts. Close public registration (`POST /api/auth/register` returns 403 Forbidden) and require onboarding via platform provisioning or staff invite claims.
- **Consequences**: Zero loss of throttling counters during restarts/deployments, immunity from shared IP counter lockouts, and reduced attack surface during pilot operations.

