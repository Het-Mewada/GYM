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
   - Unauthorized modifications or deletions of immutable financial records (`payments`, `subscription_adjustments`, `attendance_logs`, `audit_logs`).
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
- Direct `UPDATE` and `DELETE` on financial tables (`payments`, `subscription_adjustments`), audit logs (`audit_logs`), and check-in logs (`attendance_logs`) are revoked from `app_user`. Immutability triggers enforce database-level rejection.

---

## 3. Concurrency & Integrity Invariants

### 1. Gap-Free Per-Gym Receipt Sequences
Receipt numbers take the format `REC-YYYYMM-XXXXXX` (e.g., `REC-202611-000001`).
- The `receipt_sequences` table is keyed by `gym_id` (`PRIMARY KEY (gym_id)`).
- When a receipt is generated, `generate_receipt_number()` locks the gym's counter row using `SELECT next_receipt_number ... FOR UPDATE`.
- **Why Gym 1 and Gym 2 both receive `REC-202611-000001`**:
  Receipt sequence counters are isolated per gym tenant. Gym 1's counter begins at 1, and Gym 2's counter begins at 1. Neither gym can see, lock, or exhaust the receipt numbers of another gym. This prevents cross-tenant lock contention and guarantees independent, gap-free audit numbering per legal entity.

### 2. Transaction Advisory Locks for Race Serialization
- **Refunds**: Guarded by `pg_advisory_xact_lock(hashtext('payment_refund'), hashtext(parent_payment_id::text))`. Concurrent refund attempts against the same parent payment are serialized, preventing over-refund double spending.
- **Subscriptions**: Guarded by `pg_advisory_xact_lock(hashtext('member_subscription'), hashtext(member_id::text))`. Concurrent subscription creations or transitions are serialized, preventing overlapping active periods.

### 3. Subscription Freeze & Trigger Depth
When a subscription with a queued renewal is frozen, `apply_subscription_freeze_shift()` shifts the renewal start and end dates forward by the freeze duration.
- To prevent false-positive overlap triggers during the atomic shift, the overlap validator inspects `pg_trigger_depth() > 1`.
- This relies on PostgreSQL's internal C execution stack rather than session variables, eliminating race conditions across connection pool sessions.

---

## 4. Banning String-Concatenated SQL Queries

To eliminate SQL injection vulnerabilities:
- All database queries must use parameterized placeholders (`$1, $2, ...`) or Drizzle ORM query builders.
- A static analysis lint rule and pre-commit check ban template string interpolation (`${...}`) inside SQL query calls.
