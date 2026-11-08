# Security & Threat Model: Gym Management SaaS

## 1. Threat Model Overview

This document outlines the security architecture, threat model, boundaries, and defense-in-depth guarantees implemented in the Gym Management SaaS.

### What the Defense Layers Defend Against
1. **Application Logic Bugs & IDOR (Insecure Direct Object Reference)**:
   - Developers accidentally omitting `WHERE gym_id = ?` in API endpoints.
   - Malicious tenants attempting to access, modify, or delete another tenant's members, plans, payments, check-ins, or settings by tampering with UUID route parameters or request body parameters.
2. **Concurrent Race Conditions & Double-Spending**:
   - Concurrent refund requests attempting to refund more than the original payment amount.
   - Concurrent subscription purchases or status transitions creating overlapping active subscription periods for the same member.
   - Concurrent receipt number generation causing duplicate numbers or numbering gaps.
3. **Data Tampering & Ledger Invariants**:
   - Unauthorized modifications or deletions of immutable financial records (`payment_transactions`, `subscription_adjustments`, `attendance_logs`, `audit_logs`).
   - Unauthorized escalation of role memberships (e.g. non-owners attempting to claim owner status or alter permissions).
4. **Credential Leakage**:
   - Accidental exposure of Argon2id password hashes or refresh token hashes via broad `SELECT * FROM users` queries.

### What the Defense Layers DO NOT Defend Against
1. **Compromised Host or Superuser Account**:
   - If an attacker gains host-level root access to the PostgreSQL server or the `postgres` superuser password, database-level RLS does not defend against superuser bypasses.
2. **SQL Injection (SQLi)**:
   - If an application endpoint dynamically concatenates untrusted user input into raw SQL queries (e.g. `query("SELECT ... WHERE name = '" + input + "'")`), an attacker could potentially execute `SELECT set_config('app.gym_id', ...)` or terminate transactions. Strict parameterized queries (`$1, $2`) and static analysis linting rules are mandatory to prevent SQL injection.
3. **Compromised API Process with Escalated Database Privileges**:
   - The application connects strictly as `app_user` (`rolsuper = false`, `rolbypassrls = false`). If the application process were configured with `definer_admin` or `postgres` credentials, RLS protections would be bypassed. Startup assertions verify role privileges at boot.

---

## 2. Multi-Tenant Architecture & RLS Boundary

### Principle of Least Privilege
The application API process connects exclusively via the `app_user` role:
```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
-- Guaranteed: rolsuper = false, rolbypassrls = false
```

Every tenant-owned table enforces PostgreSQL Row-Level Security:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
```
`FORCE ROW LEVEL SECURITY` guarantees that even table owners cannot bypass policies.

### Tenant Isolation Context
Every tenant request is wrapped in a dedicated database transaction:
```sql
SELECT set_config('app.gym_id', $1, true);
SELECT set_config('app.user_id', $2, true);
```
- The third parameter `true` sets the scope to `LOCAL` (transaction-scoped). When the transaction commits or rolls back, the context is automatically cleared, preventing connection pool leakage.
- Parameterized queries (`$1, $2`) are enforced to eliminate SQL injection vectors. String-interpolated `SET LOCAL` is forbidden.

### Table & Column Privilege Boundaries
To ensure defense-in-depth:
- Direct `SELECT` on sensitive columns in `users` (`password_hash`) and `refresh_tokens` is revoked from `app_user`. All authentication lookups are routed through dedicated `SECURITY DEFINER` functions (`auth_lookup_user_by_phone`, `auth_complete_password_reset`).
- Direct `UPDATE` and `DELETE` on financial tables (`payment_transactions`, `subscription_adjustments`), audit logs (`audit_logs`), and check-in logs (`attendance_logs`) are revoked from `app_user`. Immutability triggers enforce database-level rejection. Any administrative check-in cancellation must route through the `void_attendance_record` procedure, which enforces owner/manager authorization directly at the database layer.

---

## 3. Concurrency & Integrity Invariants

### 1. Gap-Free Per-Gym Receipt Sequences
Receipt numbers take the format `REC-YYYYMM-XXXXXX` (e.g., `REC-202611-000001`).
- The `receipt_sequences` table is keyed by `gym_id` (`PRIMARY KEY (gym_id)`).
- When a receipt is generated, `generate_next_receipt_number(UUID)` locks the gym's counter row using `SELECT next_receipt_number ... FOR UPDATE`.
- **Why Gym 1 and Gym 2 both receive `REC-202611-000001`**:
  Receipt sequence counters are isolated per gym tenant. Gym 1's counter begins at 1, and Gym 2's counter begins at 1. Neither gym can see, lock, or exhaust the receipt numbers of another gym. This prevents cross-tenant lock contention and guarantees independent, gap-free audit numbering per legal entity.

### 2. Transaction Advisory Locks for Race Serialization
- **Refunds**: Guarded by `pg_advisory_xact_lock(hashtext('payment_refund'), hashtext(parent_payment_id::text))`. Concurrent refund attempts against the same parent payment are serialized, preventing over-refund double spending.
- **Subscriptions**: Guarded by `pg_advisory_xact_lock(hashtext('member_subscription'), hashtext(member_id::text))`. Concurrent subscription creations or transitions are serialized, preventing overlapping active periods.

### 3. Subscription Freeze & Trigger Depth
When a subscription with a queued renewal is frozen, trigger `trg_subscription_freeze_shift` executes `fn_shift_queued_subscription_dates_on_freeze()` to shift the renewal start and end dates forward by the freeze duration.
- To prevent false-positive overlap triggers during the atomic shift, the overlap validator inspects `pg_trigger_depth() > 1`.
- This relies on PostgreSQL's internal C execution stack rather than session variables, eliminating race conditions across connection pool sessions.

---

## 4. Banning String-Concatenated SQL Queries

To eliminate SQL injection vulnerabilities:
- All database queries must use parameterized placeholders (`$1, $2, ...`) or Drizzle ORM query builders.
- A static analysis lint rule (`scripts/check_no_raw_sql_concatenation.mjs`) and pre-commit check ban template string interpolation (`${...}`) inside SQL query calls.

---

## 5. Authentication, JWT Configuration & Session Security

### Argon2id Password Hashing Parameters
Passwords are protected using Argon2id with parameters aligned with OWASP guidelines:
```typescript
export const ARGON2ID_PARAMS = {
  memoryCost: 65536, // 64 MiB RAM cost per hash
  timeCost: 3,       // 3 iterations
  parallelism: 4     // 4 threads
} as const;
```
- Resistant to GPU, ASIC, and side-channel timing attacks.
- SHA-256 is used strictly for high-entropy token hashing (refresh tokens, staff invites, password reset tokens) where brute-force is infeasible due to 256-bit entropy.

### JWT Configuration & Algorithm Pinning
- **Algorithm**: Pinned strictly to `HS256`. Both signing and verification explicitly specify `algorithms: ['HS256']`. Tokens with algorithm `none` or mismatched algorithms are immediately rejected.
- **Secret Length**: Minimum 32 characters (256-bit entropy). The server throws an error on boot if `JWT_SECRET` is shorter.
- **Standard Claims**:
  - `iss`: `gym-saas-api`
  - `aud`: `gym-saas-app`
  - `sub`: `userId`
  - `exp`: 15 minutes (short-lived access tokens)

### JWT Secret Rotation Story
The API supports zero-downtime key rotation through dual-secret verification:
1. When rotating the secret, generate new secret `K_new`.
2. Configure the server with `JWT_SECRET=K_new` and `JWT_SECRET_PREVIOUS=K_old`.
3. Newly signed tokens use `K_new`.
4. Existing tokens signed with `K_old` continue to verify against `JWT_SECRET_PREVIOUS` until expiration (15 minutes).
5. After 15 minutes, remove `JWT_SECRET_PREVIOUS`.

### Refresh Token Rotation with Concurrency Grace Window
- Tokens are single-use and rotated on every `/api/auth/refresh`.
- **Grace Window**: A 10-second grace window (`REFRESH_GRACE_WINDOW_MS = 10_000`) is supported. If two legitimate requests from the same client (e.g. concurrent browser tabs) present the same token within 10 seconds of its rotation, the server returns the active session rather than invalidating the token family.
- **Reuse Detection**: Any reuse attempt occurring after the 10-second grace window is treated as an active token theft attack; the entire token family (`family_id`) is revoked immediately, logging out all sessions.

### Database-Backed Login Throttling (Per-IP & Per-Account)
- **Where Counters Live**: Throttling counters live directly in PostgreSQL in the dedicated `account_login_attempts` table, managed exclusively through SECURITY DEFINER database procedures: `auth_record_failed_login`, `auth_is_account_locked`, and `auth_clear_account_lockout`.
  - **Durability & Multi-Node Safety**: Counters survive Fastify process restarts, deployments, and work seamlessly across multi-instance clustered API replicas without requiring an external Redis layer.
  - **DAC Hardening**: Direct `SELECT`, `UPDATE`, and `DELETE` on `account_login_attempts` are strictly revoked from `app_user`.
- **Per-IP Rate Limiting (Counter-Friendly)**:
  - Generously configured at `max: 300` requests per 15 minutes per IP address (via `@fastify/rate-limit`).
  - **Shared Gym IP Protection**: In commercial gym operations, front desk reception tablets, POS counters, manager laptops, and staff mobile devices frequently route outbound internet traffic through a single shared commercial NAT router IP. Aggressive per-IP limits (e.g. 5 failures / IP) would cause an entire gym counter to be locked out if one receptionist mistyped their password. The generous per-IP window prevents counter disruption while defending against high-velocity DDoS flooding.
- **Strict Database Per-Account Throttling**:
  - Tracks failed attempts per account phone number (`account_key`).
  - After 5 consecutive failed attempts (`ACCOUNT_MAX_FAILED_ATTEMPTS = 5`), the specific account is locked for 5 minutes (`ACCOUNT_LOCKOUT_MS = 300_000` / `429 Too Many Requests`).
- **The Lockout-DoS Tradeoff & Mitigations**:
  - *The Threat*: Because lockouts are keyed by phone number, an adversary who knows a gym staff member's phone number could intentionally submit 5 erroneous login attempts to lock that staff member out (Account Lockout Denial of Service).
  - *Mitigations*:
    1. **Decaying Lockout Window**: Lockout duration is bounded to 5 minutes rather than permanent lockout or exponential backoff, allowing automatic recovery.
    2. **Owner-Initiated Bypass**: Gym owners can immediately generate a password reset link for the affected staff member via `/api/gyms/:gymId/staff/:userId/reset-password` without waiting for the lockout to elapse.
    3. **Post-Pilot Evolution**: Post-pilot production will introduce progressive CAPTCHA and SMS OTP challenges before triggering account lockout.
- **Timing Attack & User Enumeration Protection (Argon2id Dummy Hash)**:
  - Both known and unknown phone numbers return an identical HTTP 401 status and identical JSON body: `{"error": "Invalid phone number or password"}`.
  - When an unregistered phone number attempts login, the authentication handler executes `verifyPassword(DUMMY_ARGON2_HASH, password)` against a precomputed 64 MiB Argon2id hash. Because both valid and invalid phone lookups execute the exact same ~70ms cryptographic hashing workload, side-channel timing analysis cannot distinguish whether a phone number is registered.

---

## 6. Staff Password Reset, Closed Registration & The Unverified-Phone Threat Model

### Closed Open Registration for Pilot
- Public user registration (`POST /api/auth/register`) is closed for the pilot (returns `403 Forbidden`).
- User accounts are exclusively created via:
  1. Platform/Admin tenant provisioning (`provision_gym`), establishing the initial gym owner.
  2. Single-use staff invitations (`POST /api/auth/invites/claim`), claimed with a secure invite token generated by an owner.
- Walk-in gym members registered at the counter do NOT have online login credentials during the pilot, eliminating public member-facing credential compromise surfaces.

### Owner-Initiated Staff Password Reset
- For phone-only staff members, gym owners can generate a single-use 1-hour password reset link:
  `POST /api/gyms/:gymId/staff/:userId/reset-password`
- **Owner-Only Privilege**: Strictly restricted to caller with `role = 'owner'`. Staff or trainers cannot initiate password resets.
- **Owner Immuntability Protection**: An owner cannot reset the password of another owner (returns `403 Forbidden: Owners cannot reset passwords of other owners`), preventing rogue or compromised co-owners from seizing sole control of account ownership.
- The procedure is executed via the `auth_create_staff_password_reset` database procedure under tenant session verification (`app.gym_id` and `app.user_id`).

### The Unverified-Phone Threat Model
- **The Threat**: Gym counter staff may mistype an employee or member's phone number during initial creation. If an owner initiates a password reset to an incorrectly entered phone number, an unintended third party holding that phone number could potentially claim the account.
- **Defenses & Mitigations in Effect**:
  1. **Audit Trail**: Every staff reset generation is permanently recorded in `audit_logs` with the initiating owner's user ID, gym ID, and timestamp.
  2. **Short Token TTL**: Reset tokens expire in 1 hour and are single-use. Once redeemed or expired, subsequent use is rejected.
  3. **Closed Member Surface**: Since members do not have online accounts during the pilot, member phone mistypes pose zero authentication takeover risk.
  4. **Post-Pilot Requirement**: Prior to enabling member-facing online self-service, outbound SMS OTP verification will be required to verify phone ownership before account activation.
