export const ROLES = ['owner', 'manager', 'staff', 'trainer'] as const;
export type Role = (typeof ROLES)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'queued', 'active', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const DERIVED_DISPLAY_STATUSES = ['pending', 'queued', 'active', 'frozen', 'expiring_soon', 'expired', 'cancelled'] as const;
export type DerivedDisplayStatus = (typeof DERIVED_DISPLAY_STATUSES)[number];

export const PAYMENT_TYPES = ['payment', 'refund', 'reversal', 'opening_balance'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'upi', 'card_pos', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ATTENDANCE_METHODS = ['staff_manual', 'qr_kiosk'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

export const OVERRIDE_REASONS = [
  'medical_clearance_pending',
  'payment_promised_today',
  'forgot_wallet',
  'guest_pass',
  'other_owner_approved'
] as const;
export type OverrideReason = (typeof OVERRIDE_REASONS)[number];

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_COUNTRY = 'IN';
