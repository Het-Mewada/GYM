import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  foreignKey
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 1. tenants
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  defaultCountry: varchar('default_country', { length: 2 }).notNull().default('IN'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Kolkata'),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  taxRateBasisPoints: bigint('tax_rate_basis_points', { mode: 'bigint' }).notNull().default(sql`0`),
  taxIsInclusive: boolean('tax_is_inclusive').notNull().default(true),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// 2. users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// 3. user_gym_memberships
export const userGymMemberships = pgTable('user_gym_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // 'owner' | 'staff'
  isActive: boolean('is_active').notNull().default(true),
  passwordHash: varchar('password_hash', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_user_gym_memberships_gym_user').on(table.gymId, table.userId)
]);

// 4. staff_invitations
export const staffInvitations = pgTable('staff_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 20 }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_staff_invitations_gym_id').on(table.gymId, table.id)
]);

// 5. password_resets
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// 5b. account_login_attempts
export const accountLoginAttempts = pgTable('account_login_attempts', {
  accountKey: varchar('account_key', { length: 50 }).primaryKey(),
  failedAttempts: integer('failed_attempts').default(1).notNull(),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).defaultNow().notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true })
});

// 6. membership_plans
export const membershipPlans = pgTable('membership_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  durationDays: integer('duration_days').notNull(),
  priceCents: bigint('price_cents', { mode: 'bigint' }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_membership_plans_gym_id').on(table.gymId, table.id)
]);

// 7. members
export const members = pgTable('members', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberNumber: varchar('member_number', { length: 50 }).notNull(),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }),
  phone: varchar('phone', { length: 20 }).notNull(),
  email: varchar('email', { length: 255 }),
  gender: varchar('gender', { length: 20 }).default('unspecified'),
  dateOfBirth: date('date_of_birth'),
  emergencyContactName: varchar('emergency_contact_name', { length: 100 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  joinedDate: date('joined_date').notNull().default(sql`CURRENT_DATE`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_members_gym_id').on(table.gymId, table.id),
  uniqueIndex('uq_members_gym_phone').on(table.gymId, table.phone),
  uniqueIndex('uq_members_gym_email').on(table.gymId, table.email),
  uniqueIndex('uq_members_gym_number').on(table.gymId, table.memberNumber)
]);

// 7b. member_registration_requests
export const memberRegistrationRequests = pgTable('member_registration_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }),
  phone: varchar('phone', { length: 20 }).notNull(),
  email: varchar('email', { length: 255 }),
  gender: varchar('gender', { length: 20 }).default('unspecified'),
  dateOfBirth: date('date_of_birth'),
  emergencyContactName: varchar('emergency_contact_name', { length: 100 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: varchar('rejection_reason', { length: 255 }),
  enrolledMemberId: uuid('enrolled_member_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_member_registration_requests_gym_id').on(table.gymId, table.id),
  foreignKey({
    columns: [table.gymId, table.enrolledMemberId],
    foreignColumns: [members.gymId, members.id],
    name: 'fk_member_reg_enrolled_member'
  }).onDelete('set null')
]);

// 8. member_sequences
export const memberSequences = pgTable('member_sequences', {
  gymId: uuid('gym_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  lastMemberNumber: bigint('last_member_number', { mode: 'bigint' }).notNull().default(sql`0`)
});

// 9. subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull(),
  planId: uuid('plan_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'active' | 'queued' | 'cancelled'
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  totalPriceCents: bigint('total_price_cents', { mode: 'bigint' }).notNull(),
  discountCents: bigint('discount_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_subscriptions_gym_id').on(table.gymId, table.id),
  foreignKey({
    columns: [table.gymId, table.memberId],
    foreignColumns: [members.gymId, members.id],
    name: 'fk_subscriptions_member'
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.gymId, table.planId],
    foreignColumns: [membershipPlans.gymId, membershipPlans.id],
    name: 'fk_subscriptions_plan'
  }).onDelete('restrict')
]);

// 10. subscription_freezes
export const subscriptionFreezes = pgTable('subscription_freezes', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').notNull(),
  freezeStart: date('freeze_start').notNull(),
  freezeEnd: date('freeze_end').notNull(),
  daysFrozen: integer('days_frozen').notNull(),
  reason: text('reason').notNull(),
  approvedByUserId: uuid('approved_by_user_id').notNull().references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_subscription_freezes_gym_id').on(table.gymId, table.id),
  foreignKey({
    columns: [table.gymId, table.subscriptionId],
    foreignColumns: [subscriptions.gymId, subscriptions.id],
    name: 'fk_subscription_freezes_subscription'
  }).onDelete('cascade')
]);

// 11. subscription_adjustments
export const subscriptionAdjustments = pgTable('subscription_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id)
}, (table) => [
  uniqueIndex('uq_subscription_adjustments_gym_id').on(table.gymId, table.id),
  foreignKey({
    columns: [table.gymId, table.subscriptionId],
    foreignColumns: [subscriptions.gymId, subscriptions.id],
    name: 'fk_subscription_adjustments_subscription'
  }).onDelete('restrict')
]);

// 12. payment_transactions
export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull(),
  subscriptionId: uuid('subscription_id'),
  idempotencyKey: uuid('idempotency_key').notNull(),
  receiptNumber: varchar('receipt_number', { length: 50 }),
  type: varchar('type', { length: 30 }).notNull(), // 'payment' | 'refund' | 'opening_balance'
  method: varchar('method', { length: 30 }).notNull(), // 'cash' | 'upi' | 'card' | 'bank_transfer' | 'system'
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  taxCents: bigint('tax_cents', { mode: 'bigint' }).notNull().default(sql`0`),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  effectiveDate: date('effective_date').notNull().default(sql`CURRENT_DATE`),
  externalReference: varchar('external_reference', { length: 100 }),
  parentTransactionId: uuid('parent_transaction_id'),
  notes: text('notes'),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_payment_transactions_gym_id').on(table.gymId, table.id),
  uniqueIndex('uq_payments_idempotency').on(table.gymId, table.idempotencyKey),
  foreignKey({
    columns: [table.gymId, table.memberId],
    foreignColumns: [members.gymId, members.id],
    name: 'fk_payment_transactions_member'
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.gymId, table.subscriptionId],
    foreignColumns: [subscriptions.gymId, subscriptions.id],
    name: 'fk_payment_transactions_subscription'
  }).onDelete('restrict'),
  foreignKey({
    columns: [table.gymId, table.parentTransactionId],
    foreignColumns: [table.gymId, table.id],
    name: 'fk_payment_transactions_parent'
  }).onDelete('restrict')
]);

// 13. attendance_logs
export const attendanceLogs = pgTable('attendance_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull(),
  attendanceDate: date('attendance_date').notNull(),
  checkInTime: timestamp('check_in_time', { withTimezone: true }).notNull().defaultNow(),
  method: varchar('method', { length: 20 }).notNull().default('desk'),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id),
  wasOverride: boolean('was_override').notNull().default(false),
  overrideReason: varchar('override_reason', { length: 255 }),
  isVoided: boolean('is_voided').notNull().default(false),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedByUserId: uuid('voided_by_user_id').references(() => users.id),
  voidReason: text('void_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_attendance_logs_gym_id').on(table.gymId, table.id),
  foreignKey({
    columns: [table.gymId, table.memberId],
    foreignColumns: [members.gymId, members.id],
    name: 'fk_attendance_logs_member'
  }).onDelete('restrict')
]);

// 14. audit_logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 20 }).notNull().default('user'),
  action: varchar('action', { length: 50 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  changedFields: text('changed_fields').array().notNull().default(sql`'{}'`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// 15. csv_import_jobs
export const csvImportJobs = pgTable('csv_import_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSha256: varchar('file_sha256', { length: 64 }).notNull(),
  totalRows: integer('total_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errorsJson: jsonb('errors_json').notNull().default(sql`'[]'::jsonb`),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true })
}, (table) => [
  uniqueIndex('uq_csv_import_jobs_gym_id').on(table.gymId, table.id),
  uniqueIndex('uq_csv_import_file').on(table.gymId, table.fileSha256)
]);

// 16. notification_logs
export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull(),
  channel: varchar('channel', { length: 20 }).notNull(),
  template: varchar('template', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('uq_notification_logs_gym_id').on(table.gymId, table.id)
]);

// 17. receipt_sequences
export const receiptSequences = pgTable('receipt_sequences', {
  gymId: uuid('gym_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  lastReceiptNumber: bigint('last_receipt_number', { mode: 'bigint' }).notNull().default(sql`0`)
});

// 18. refresh_tokens
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  gymId: uuid('gym_id').references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  familyId: uuid('family_id').notNull().defaultRandom(),
  isRevoked: boolean('is_revoked').notNull().default(false),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Types
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserGymMembership = typeof userGymMemberships.$inferSelect;
export type NewUserGymMembership = typeof userGymMemberships.$inferInsert;

export type StaffInvitation = typeof staffInvitations.$inferSelect;
export type NewStaffInvitation = typeof staffInvitations.$inferInsert;

export type PasswordReset = typeof passwordResets.$inferSelect;
export type NewPasswordReset = typeof passwordResets.$inferInsert;

export type AccountLoginAttempt = typeof accountLoginAttempts.$inferSelect;
export type NewAccountLoginAttempt = typeof accountLoginAttempts.$inferInsert;

export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type NewMembershipPlan = typeof membershipPlans.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type MemberSequence = typeof memberSequences.$inferSelect;
export type NewMemberSequence = typeof memberSequences.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type SubscriptionFreeze = typeof subscriptionFreezes.$inferSelect;
export type NewSubscriptionFreeze = typeof subscriptionFreezes.$inferInsert;

export type SubscriptionAdjustment = typeof subscriptionAdjustments.$inferSelect;
export type NewSubscriptionAdjustment = typeof subscriptionAdjustments.$inferInsert;

export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert;

export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type CsvImportJob = typeof csvImportJobs.$inferSelect;
export type NewCsvImportJob = typeof csvImportJobs.$inferInsert;

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type NewNotificationLog = typeof notificationLogs.$inferInsert;

export type ReceiptSequence = typeof receiptSequences.$inferSelect;
export type NewReceiptSequence = typeof receiptSequences.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
