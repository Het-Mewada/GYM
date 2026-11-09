'use client';

import React, { useState, useEffect, useId } from 'react';

export interface CountryOption {
  code: string;        // e.g. "+91"
  name: string;        // e.g. "India"
  flag: string;        // e.g. "🇮🇳"
  countryCode: string; // e.g. "IN"
}

export const COUNTRY_CODES: CountryOption[] = [
  { code: '+91', name: 'India', flag: '🇮🇳', countryCode: 'IN' },
  { code: '+1', name: 'USA / Canada', flag: '🇺🇸', countryCode: 'US' },
  { code: '+44', name: 'UK', flag: '🇬🇧', countryCode: 'GB' },
  { code: '+971', name: 'UAE', flag: '🇦🇪', countryCode: 'AE' },
  { code: '+61', name: 'Australia', flag: '🇦🇺', countryCode: 'AU' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬', countryCode: 'SG' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦', countryCode: 'SA' },
  { code: '+974', name: 'Qatar', flag: '🇶🇦', countryCode: 'QA' },
  { code: '+49', name: 'Germany', flag: '🇩🇪', countryCode: 'DE' },
  { code: '+33', name: 'France', flag: '🇫🇷', countryCode: 'FR' },
  { code: '+81', name: 'Japan', flag: '🇯🇵', countryCode: 'JP' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾', countryCode: 'MY' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿', countryCode: 'NZ' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦', countryCode: 'ZA' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷', countryCode: 'BR' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵', countryCode: 'NP' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩', countryCode: 'BD' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰', countryCode: 'LK' }
];

export interface PhoneInputProps {
  id?: string;
  name?: string;
  value?: string; // full phone (e.g. "+919876543210") or 10 digits
  countryCode?: string;
  onChange?: (fullPhone: string, countryCode: string, digits10: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  dataTestId?: string;
  className?: string;
}

export function parsePhone(raw?: string, fallbackCountry = '+91'): { countryCode: string; digits: string } {
  if (!raw) return { countryCode: fallbackCountry, digits: '' };
  const trimmed = raw.trim();

  // Sort country codes by descending length so +971 is matched before +9 etc.
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (trimmed.startsWith(c.code)) {
      const rest = trimmed.slice(c.code.length).replace(/\D/g, '').slice(0, 10);
      return { countryCode: c.code, digits: rest };
    }
  }

  if (trimmed.startsWith('+')) {
    const match = trimmed.match(/^\+(\d{1,4})(\d*)$/);
    if (match) {
      return { countryCode: `+${match[1]}`, digits: match[2].slice(0, 10) };
    }
  }

  // Raw digits
  const digitsOnly = trimmed.replace(/\D/g, '').slice(0, 10);
  return { countryCode: fallbackCountry, digits: digitsOnly };
}

export function PhoneInput({
  id,
  name,
  value = '',
  countryCode: propCountryCode,
  onChange,
  placeholder = '9876543210',
  required = false,
  disabled = false,
  dataTestId = 'phone-input',
  className = ''
}: PhoneInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  // Initialize from value or propCountryCode
  const parsed = parsePhone(value, propCountryCode || '+91');
  const [selectedCountry, setSelectedCountry] = useState<string>(propCountryCode || parsed.countryCode);
  const [digits, setDigits] = useState<string>(parsed.digits);

  // Sync when value prop changes externally
  useEffect(() => {
    const updated = parsePhone(value, propCountryCode || selectedCountry);
    setDigits(updated.digits);
    if (propCountryCode) {
      setSelectedCountry(propCountryCode);
    } else if (value && value.startsWith('+')) {
      setSelectedCountry(updated.countryCode);
    }
  }, [value, propCountryCode]);

  const emitChange = (newCountry: string, newDigits: string) => {
    setSelectedCountry(newCountry);
    setDigits(newDigits);
    if (onChange) {
      const fullPhone = newDigits.length > 0 ? `${newCountry}${newDigits}` : '';
      onChange(fullPhone, newCountry, newDigits);
    }
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    emitChange(newCountry, digits);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation, deletion, clipboard shortcuts
    if (
      ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'].includes(e.key) ||
      e.ctrlKey || e.metaKey || e.altKey
    ) {
      return;
    }

    // Only allow single numeric digits 0-9
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
      return;
    }

    // User cannot type more than 10 digits
    const target = e.currentTarget;
    const hasSelection = (target.selectionEnd ?? 0) - (target.selectionStart ?? 0) > 0;
    if (target.value.length >= 10 && !hasSelection) {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;

    // If input starts with +, parse country code out of it (e.g. from Playwright fill('+919988776655') or clipboard paste)
    if (rawInput.startsWith('+')) {
      const parsedFromInput = parsePhone(rawInput, selectedCountry);
      emitChange(parsedFromInput.countryCode, parsedFromInput.digits);
      return;
    }

    // Strip non-digits and cap strictly at 10 digits
    const cleanDigits = rawInput.replace(/\D/g, '').slice(0, 10);
    emitChange(selectedCountry, cleanDigits);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    if (pasted.startsWith('+')) {
      const parsedFromPaste = parsePhone(pasted, selectedCountry);
      emitChange(parsedFromPaste.countryCode, parsedFromPaste.digits);
      return;
    }
    const cleanDigits = pasted.replace(/\D/g, '').slice(0, 10);
    emitChange(selectedCountry, cleanDigits);
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex rounded-lg border border-neutral-800 bg-neutral-950 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition overflow-hidden shadow-sm">
        {/* Country Code Picker Dropdown */}
        <select
          value={selectedCountry}
          onChange={handleCountryChange}
          disabled={disabled}
          data-testid={`${dataTestId}-country`}
          aria-label="Country Code"
          className="bg-neutral-900 hover:bg-neutral-850 text-neutral-200 text-xs font-mono px-3 py-2 border-r border-neutral-800 focus:outline-none cursor-pointer transition select-none flex-shrink-0"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code} className="bg-neutral-900 text-neutral-100 py-1">
              {c.flag} {c.code} ({c.countryCode})
            </option>
          ))}
        </select>

        {/* 10-Digit Phone Number Input */}
        <input
          id={inputId}
          name={name}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={15}
          value={digits}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          data-testid={dataTestId}
          autoComplete="tel-national"
          className="w-full px-3 py-2 bg-transparent text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none disabled:opacity-50"
        />

        {/* 10-Digit Character Counter Badge */}
        <div className="flex items-center pr-3 text-[11px] font-mono select-none flex-shrink-0">
          {digits.length === 10 ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1" title="Exact 10 digits entered">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              10/10
            </span>
          ) : digits.length > 0 ? (
            <span className="text-amber-400 font-medium" title="Must be exactly 10 digits">
              {digits.length}/10
            </span>
          ) : (
            <span className="text-neutral-500">
              0/10
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
