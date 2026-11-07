# Database Specification (DDL v3)

This document contains the authoritative PostgreSQL schema for the Multi-Tenant Gym Management SaaS.

## Extensions & Roles
- Extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`
- Runtime Role: `app_user` (NOBYPASSRLS)
- Migration Role: `migration_role` (BYPASSRLS)

## Core Schema & Security Features

### 1. Global Tables
- `users`: User identity and hashed passwords (Argon2id).
- `refresh_tokens`: Multi-device session rotation with `gym_id`, `family_id`, and reuse detection.
- `password_resets`: Cryptographic single-use token hashes.
- `tenants`: Gym tenant metadata, timezone, currency, tax rates.
- `user_gym_memberships`: Role-based membership linking user to gym.
- `receipt_sequences`: Monotonic locking receipt counter per tenant.

### 2. Tenant Tables (FORCE ROW LEVEL SECURITY)
- `staff_invitations`: Single-use invite tokens for WhatsApp sharing.
- `membership_plans`: Plan pricing, duration, and status.
- `members`: Gym clients (supports single names, phone numbers normalized to E.164).
- `member_sequences`: Monotonic per-gym counter for member numbers (`MEM-0001`).
- `subscriptions`: Stored statuses: `pending`, `queued`, `active`, `cancelled`. Status `frozen` is derived from `subscription_freezes`.
- `subscription_freezes`: Freeze periods extending end_date.
- `payment_transactions`: Append-only ledger supporting `payment`, `refund`, `reversal`, and `opening_balance`.
- `attendance_logs`: Daily idempotent check-ins enforced via `(gym_id, member_id, attendance_date)`.
- `csv_import_jobs`: Import tracking with PII-free error codes.
- `notification_logs`: Dispatched communications with anonymized recipient hashes.
- `audit_logs`: Append-only, PII-free operational audit records supporting system actors.

### 3. SECURITY DEFINER Functions
- `provision_gym()`: Creates tenant, provisions receipt and member counters, assigns owner.
- `claim_staff_invitation()`: Validates token hash and links staff member to gym.
- `generate_next_receipt_number()`: Locks tenant counter row and generates sequential gap-free receipt code.
- `generate_next_member_number()`: Locks member counter row and generates sequential member identifier.

### 4. Integrity Constraints
- Every child table foreign key is composite: `FOREIGN KEY (gym_id, parent_id) REFERENCES parent(gym_id, id) ON DELETE RESTRICT`.
- Financial amounts and taxes are checked against transaction types: payments require positive sums; refunds require negative sums and valid parent transaction references.
- Cumulative refunds are validated via database trigger to never exceed the original payment amount.
