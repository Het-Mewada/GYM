import { z } from 'zod';
import { OVERRIDE_REASONS, PAYMENT_METHODS } from '../constants/index.js';

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
  amountCents: z.number().int(),
  method: z.enum(PAYMENT_METHODS),
  externalReference: z.string().max(100).optional().nullable(),
  notes: z.string().max(255).optional().nullable()
});

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
