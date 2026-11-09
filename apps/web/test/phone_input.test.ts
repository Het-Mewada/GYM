import { describe, expect, it } from 'vitest';
import { parsePhone, COUNTRY_CODES } from '../app/components/PhoneInput';

describe('PhoneInput & Phone Validation Suite', () => {
  it('parses raw 10-digit input using default +91 country code', () => {
    const result = parsePhone('9876543210');
    expect(result.countryCode).toBe('+91');
    expect(result.digits).toBe('9876543210');
  });

  it('parses E.164 string with Indian country code (+91)', () => {
    const result = parsePhone('+919876543210');
    expect(result.countryCode).toBe('+91');
    expect(result.digits).toBe('9876543210');
  });

  it('parses E.164 string with US/Canada country code (+1)', () => {
    const result = parsePhone('+14155552671');
    expect(result.countryCode).toBe('+1');
    expect(result.digits).toBe('4155552671');
  });

  it('parses E.164 string with UAE country code (+971)', () => {
    const result = parsePhone('+971501234567');
    expect(result.countryCode).toBe('+971');
    expect(result.digits).toBe('501234567');
  });

  it('strips non-digits and truncates to maximum 10 digits', () => {
    const result = parsePhone('+91 987-654-3210999');
    expect(result.countryCode).toBe('+91');
    expect(result.digits).toBe('9876543210');
    expect(result.digits.length).toBe(10);
  });

  it('handles empty or undefined values gracefully', () => {
    const resultEmpty = parsePhone('');
    expect(resultEmpty.countryCode).toBe('+91');
    expect(resultEmpty.digits).toBe('');

    const resultUndefined = parsePhone(undefined);
    expect(resultUndefined.countryCode).toBe('+91');
    expect(resultUndefined.digits).toBe('');
  });

  it('contains expected standard country codes in COUNTRY_CODES list', () => {
    const codes = COUNTRY_CODES.map((c) => c.code);
    expect(codes).toContain('+91');
    expect(codes).toContain('+1');
    expect(codes).toContain('+44');
    expect(codes).toContain('+971');
  });
});
