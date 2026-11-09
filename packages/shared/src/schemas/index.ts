import { z } from 'zod';
import { OVERRIDE_REASONS, PAYMENT_METHODS, ATTENDANCE_METHODS, NOTIFICATION_CHANNELS, NOTIFICATION_TEMPLATES } from '../constants/index.js';

export const PhoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, {
  message: 'Phone number must be a valid E.164 formatted string with leading +'
});

export const LoginRequestSchema = z.object({
  phone: PhoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export const ProvisionGymSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  defaultCountry: z.string().length(2).default('IN'),
  timezone: z.string().default('Asia/Kolkata'),
  currency: z.string().length(3).default('INR'),
  taxRateBasisPoints: z.number().int().min(0).default(0)
});

export const MemberCreateSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().max(50).optional().nullable(),
  phone: PhoneSchema,
  email: z.string().email().optional().nullable(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).default('unspecified'),
  dateOfBirth: z.string().date().optional().nullable(),
  emergencyContactName: z.string().max(100).optional().nullable(),
  emergencyContactPhone: PhoneSchema.optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

export const CheckInSchema = z.object({
  memberId: z.string().uuid(),
  overrideReason: z.enum(OVERRIDE_REASONS).optional().nullable()
});

export const PaymentRecordSchema = z.object({
  memberId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().uuid(),
  amountCents: z.number().int().positive('Payment amount must be greater than 0'),
  method: z.enum(PAYMENT_METHODS),
  externalReference: z.string().max(100).optional().nullable(),
  notes: z.string().max(255).optional().nullable()
});

export const RefundRecordSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amountCents: z.number().int().positive('Refund amount must be greater than 0'),
  method: z.enum(PAYMENT_METHODS).optional(),
  cancelSubscription: z.boolean().optional(),
  notes: z.string().max(255).optional().nullable()
});

export type PaymentRecordInput = z.infer<typeof PaymentRecordSchema>;
export type RefundRecordInput = z.infer<typeof RefundRecordSchema>;

export const MembershipPlanCreateSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(100),
  durationDays: z.number().int().positive('Duration in days must be greater than 0'),
  priceCents: z.number().int().min(0, 'Price must be non-negative')
});

export const MembershipPlanUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  durationDays: z.number().int().positive().optional(),
  priceCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

export const SubscriptionCreateSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD').optional(),
  discountCents: z.number().int().min(0).default(0)
});

export type MembershipPlanCreateInput = z.infer<typeof MembershipPlanCreateSchema>;
export type MembershipPlanUpdateInput = z.infer<typeof MembershipPlanUpdateSchema>;
export type SubscriptionCreateInput = z.infer<typeof SubscriptionCreateSchema>;

export const AttendanceCheckInSchema = z.object({
  memberId: z.string().uuid('Invalid member ID'),
  method: z.enum(ATTENDANCE_METHODS).default('staff_manual'),
  wasOverride: z.boolean().default(false),
  overrideReason: z.enum(OVERRIDE_REASONS).optional().nullable()
}).refine(
  (data) => !data.wasOverride || (data.overrideReason !== undefined && data.overrideReason !== null),
  {
    message: 'Override reason is required when wasOverride is true',
    path: ['overrideReason']
  }
);

export const AttendanceVoidSchema = z.object({
  voidReason: z.string().min(3, 'Void reason must be at least 3 characters').max(255)
});

export type AttendanceCheckInInput = z.infer<typeof AttendanceCheckInSchema>;
export type AttendanceVoidInput = z.infer<typeof AttendanceVoidSchema>;

export const MemberRegistrationRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().max(50).optional().nullable(),
  phone: PhoneSchema,
  email: z.string().email('Invalid email address').optional().nullable(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).default('unspecified'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD').optional().nullable(),
  emergencyContactName: z.string().max(100).optional().nullable(),
  emergencyContactPhone: PhoneSchema.optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

export const MemberRegistrationRejectSchema = z.object({
  reason: z.string().max(255).optional().nullable()
});

export type MemberRegistrationRequestInput = z.infer<typeof MemberRegistrationRequestSchema>;
export type MemberRegistrationRejectInput = z.infer<typeof MemberRegistrationRejectSchema>;

export const SendNotificationSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  template: z.enum(NOTIFICATION_TEMPLATES),
  customMessage: z.string().max(1000).optional().nullable()
});

export type SendNotificationInput = z.infer<typeof SendNotificationSchema>;

