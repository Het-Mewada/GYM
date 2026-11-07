import { describe, expect, it } from 'vitest';
import { MemberCreateSchema, PhoneSchema } from './index.js';

describe('Shared Schemas', () => {
  it('validates E.164 phone numbers with leading +', () => {
    expect(PhoneSchema.safeParse('+919876543210').success).toBe(true);
    expect(PhoneSchema.safeParse('+12125550199').success).toBe(true);
    expect(PhoneSchema.safeParse('9876543210').success).toBe(false);
    expect(PhoneSchema.safeParse('+012345').success).toBe(false);
  });

  it('allows single-name members where lastName is omitted or null', () => {
    const singleNameResult = MemberCreateSchema.safeParse({
      firstName: 'Kavita',
      phone: '+919876543210'
    });
    expect(singleNameResult.success).toBe(true);

    const withNullLastName = MemberCreateSchema.safeParse({
      firstName: 'Rahul',
      lastName: null,
      phone: '+919876543210'
    });
    expect(withNullLastName.success).toBe(true);
  });
});
