export interface PiiFreeCsvError {
  row: number;
  field: string;
  code: string;
  message: string;
}

export interface CsvMemberInput {
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  gender: 'male' | 'female' | 'other' | 'unspecified';
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: string[][];
}

/**
 * Robust RFC 4180 compliant CSV parser.
 * Supports quoted fields with commas, internal quotes (""), newlines, CRLF/LF line endings, and BOM stripping.
 */
export function parseCsv(csvText: string): ParsedCsvResult {
  // Strip BOM if present
  let text = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          // Closing quote
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Consume '\n' of CRLF
        }
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  // Push final field and row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

/**
 * Standardizes common CSV column names to canonical internal field names.
 */
export function normalizeCsvHeader(header: string): string {
  const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  switch (clean) {
    case 'firstname':
    case 'first':
      return 'firstName';
    case 'lastname':
    case 'last':
    case 'surname':
      return 'lastName';
    case 'phone':
    case 'phonenumber':
    case 'mobile':
    case 'mobilenumber':
    case 'contact':
    case 'contactnumber':
    case 'cell':
      return 'phone';
    case 'email':
    case 'emailaddress':
      return 'email';
    case 'gender':
    case 'sex':
      return 'gender';
    case 'dateofbirth':
    case 'dob':
    case 'birthdate':
    case 'birth':
      return 'dateOfBirth';
    case 'emergencycontactname':
    case 'emergencycontact':
    case 'emergencyname':
      return 'emergencyContactName';
    case 'emergencycontactphone':
    case 'emergencyphone':
      return 'emergencyContactPhone';
    case 'notes':
    case 'note':
    case 'remarks':
    case 'comments':
      return 'notes';
    default:
      return header.trim();
  }
}

/**
 * Normalizes phone numbers: converts 10 digits to standard +91 E.164, or validates leading +
 */
export function normalizePhoneForImport(raw: string, defaultCountryPrefix = '+91'): string | null {
  const clean = raw.trim().replace(/[\s\-()]/g, '');
  if (!clean) return null;

  // If already starts with '+', verify 7-15 digits
  if (clean.startsWith('+')) {
    const digitsOnly = clean.slice(1);
    if (/^\d{7,15}$/.test(digitsOnly)) {
      return clean;
    }
    return null;
  }

  // Exactly 10 digits (standard Indian mobile format)
  if (/^\d{10}$/.test(clean)) {
    return `${defaultCountryPrefix}${clean}`;
  }

  return null;
}

/**
 * Normalizes varied date formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) to standard YYYY-MM-DD
 */
export function normalizeDateForImport(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return clean;
    }
    return null;
  }

  // Format: DD/MM/YYYY or DD-MM-YYYY
  const parts = clean.split(/[/.-]/);
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const padY = String(y).padStart(4, '0');
      const padM = String(m).padStart(2, '0');
      const padD = String(d).padStart(2, '0');
      return `${padY}-${padM}-${padD}`;
    }
  }

  return null;
}

/**
 * Validates a single CSV record without leaking PII in error messages.
 */
export function validateCsvRow(
  record: Record<string, string>,
  rowIndex: number,
  defaultCountryPrefix = '+91'
): { valid: true; member: CsvMemberInput } | { valid: false; errors: PiiFreeCsvError[] } {
  const errors: PiiFreeCsvError[] = [];

  // 1. First Name (Required)
  const firstName = record['firstName']?.trim();
  if (!firstName) {
    errors.push({
      row: rowIndex,
      field: 'firstName',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'First name is required'
    });
  } else if (firstName.length > 50) {
    errors.push({
      row: rowIndex,
      field: 'firstName',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'First name exceeds 50 characters'
    });
  }

  // 2. Last Name (Optional)
  const lastName = record['lastName']?.trim() || null;
  if (lastName && lastName.length > 50) {
    errors.push({
      row: rowIndex,
      field: 'lastName',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Last name exceeds 50 characters'
    });
  }

  // 3. Phone (Required)
  const rawPhone = record['phone']?.trim();
  let normalizedPhone: string | null = null;
  if (!rawPhone) {
    errors.push({
      row: rowIndex,
      field: 'phone',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'Phone number is required'
    });
  } else {
    normalizedPhone = normalizePhoneForImport(rawPhone, defaultCountryPrefix);
    if (!normalizedPhone) {
      errors.push({
        row: rowIndex,
        field: 'phone',
        code: 'INVALID_FORMAT',
        message: 'Phone must be a valid 10-digit number or E.164 with +'
      });
    }
  }

  // 4. Email (Optional)
  const rawEmail = record['email']?.trim() || null;
  let normalizedEmail: string | null = null;
  if (rawEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail) || rawEmail.length > 255) {
      errors.push({
        row: rowIndex,
        field: 'email',
        code: 'INVALID_FORMAT',
        message: 'Invalid email address format'
      });
    } else {
      normalizedEmail = rawEmail.toLowerCase();
    }
  }

  // 5. Gender (Optional, defaults to unspecified)
  const rawGender = record['gender']?.trim().toLowerCase();
  let gender: 'male' | 'female' | 'other' | 'unspecified' = 'unspecified';
  if (rawGender) {
    if (['male', 'm'].includes(rawGender)) {
      gender = 'male';
    } else if (['female', 'f'].includes(rawGender)) {
      gender = 'female';
    } else if (['other', 'o'].includes(rawGender)) {
      gender = 'other';
    } else if (['unspecified', 'u'].includes(rawGender)) {
      gender = 'unspecified';
    } else {
      errors.push({
        row: rowIndex,
        field: 'gender',
        code: 'INVALID_OPTION',
        message: 'Gender must be male, female, other, or unspecified'
      });
    }
  }

  // 6. Date of Birth (Optional)
  const rawDob = record['dateOfBirth']?.trim();
  let normalizedDob: string | null = null;
  if (rawDob) {
    normalizedDob = normalizeDateForImport(rawDob);
    if (!normalizedDob) {
      errors.push({
        row: rowIndex,
        field: 'dateOfBirth',
        code: 'INVALID_FORMAT',
        message: 'Date of birth must be in YYYY-MM-DD or DD/MM/YYYY format'
      });
    }
  }

  // 7. Emergency Contact Name (Optional)
  const emName = record['emergencyContactName']?.trim() || null;
  if (emName && emName.length > 100) {
    errors.push({
      row: rowIndex,
      field: 'emergencyContactName',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Emergency contact name exceeds 100 characters'
    });
  }

  // 8. Emergency Contact Phone (Optional)
  const rawEmPhone = record['emergencyContactPhone']?.trim();
  let normalizedEmPhone: string | null = null;
  if (rawEmPhone) {
    normalizedEmPhone = normalizePhoneForImport(rawEmPhone, defaultCountryPrefix);
    if (!normalizedEmPhone) {
      errors.push({
        row: rowIndex,
        field: 'emergencyContactPhone',
        code: 'INVALID_FORMAT',
        message: 'Emergency contact phone must be 10 digits or E.164'
      });
    }
  }

  // 9. Notes (Optional)
  const notes = record['notes']?.trim() || null;
  if (notes && notes.length > 500) {
    errors.push({
      row: rowIndex,
      field: 'notes',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Notes exceeds 500 characters'
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    member: {
      firstName: firstName!,
      lastName,
      phone: normalizedPhone!,
      email: normalizedEmail,
      gender,
      dateOfBirth: normalizedDob,
      emergencyContactName: emName,
      emergencyContactPhone: normalizedEmPhone,
      notes
    }
  };
}
