import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  normalizeCsvHeader,
  normalizePhoneForImport,
  normalizeDateForImport,
  validateCsvRow
} from './index.js';

describe('CSV Parser & Validator', () => {
  it('parses standard RFC 4180 CSV with quotes and commas', () => {
    const csv = `First Name,Last Name,Phone,Email\nJohn,Doe,9876543210,john@example.com\n"Jane, Jr.",Smith,9876543211,jane@example.com`;
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['First Name', 'Last Name', 'Phone', 'Email']);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0]).toEqual(['John', 'Doe', '9876543210', 'john@example.com']);
    expect(parsed.rows[1]).toEqual(['Jane, Jr.', 'Smith', '9876543211', 'jane@example.com']);
  });

  it('handles CRLF line breaks and escaped quotes ("")', () => {
    const csv = 'Name,Bio\r\n"Bob ""The Builder""","Loves, fixing stuff"\r\n';
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['Name', 'Bio']);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0]).toEqual(['Bob "The Builder"', 'Loves, fixing stuff']);
  });

  it('normalizes common column headers correctly', () => {
    expect(normalizeCsvHeader('First Name')).toBe('firstName');
    expect(normalizeCsvHeader('first_name')).toBe('firstName');
    expect(normalizeCsvHeader('mobile')).toBe('phone');
    expect(normalizeCsvHeader('Phone Number')).toBe('phone');
    expect(normalizeCsvHeader('dob')).toBe('dateOfBirth');
    expect(normalizeCsvHeader('Date of Birth')).toBe('dateOfBirth');
  });

  it('normalizes phone numbers to standard E.164 (+91)', () => {
    expect(normalizePhoneForImport('9876543210')).toBe('+919876543210');
    expect(normalizePhoneForImport('+12125550199')).toBe('+12125550199');
    expect(normalizePhoneForImport('12345')).toBeNull();
    expect(normalizePhoneForImport('abcdefghij')).toBeNull();
  });

  it('normalizes varied dates to YYYY-MM-DD', () => {
    expect(normalizeDateForImport('1995-08-15')).toBe('1995-08-15');
    expect(normalizeDateForImport('15/08/1995')).toBe('1995-08-15');
    expect(normalizeDateForImport('15-08-1995')).toBe('1995-08-15');
    expect(normalizeDateForImport('invalid-date')).toBeNull();
  });

  it('validates valid row and returns clean typed member', () => {
    const row = {
      firstName: 'Kavita',
      lastName: 'Patel',
      phone: '9876543210',
      email: 'kavita@example.com',
      gender: 'female',
      dateOfBirth: '1996-05-20'
    };
    const res = validateCsvRow(row, 2);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.member.firstName).toBe('Kavita');
      expect(res.member.phone).toBe('+919876543210');
      expect(res.member.gender).toBe('female');
      expect(res.member.dateOfBirth).toBe('1996-05-20');
    }
  });

  it('returns PII-free errors for missing or invalid fields', () => {
    const row = {
      firstName: '',
      phone: 'invalid-phone',
      email: 'bad-email'
    };
    const res = validateCsvRow(row, 5);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.length).toBe(3);
      // Verify PII is NOT in the error message
      for (const err of res.errors) {
        expect(err.row).toBe(5);
        expect(err.message).not.toContain('invalid-phone');
        expect(err.message).not.toContain('bad-email');
      }
    }
  });
});
