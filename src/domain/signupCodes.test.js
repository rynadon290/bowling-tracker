import { describe, it, expect } from 'vitest';
import { generateSignupCode, normalizeSignupCode, isValidSignupCode } from './signupCodes.js';

// A captain at the lanes has four teammates and two email addresses.
// Requiring an email closed a real hole -- a captain could otherwise
// search every account and add anyone without consent -- but it left
// that captain stuck. A code they can text is the way out, and consent
// stays intact because the teammate chooses to enter it.
describe('generateSignupCode', () => {
  it('produces a readable hyphenated code', () => {
    expect(generateSignupCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  // A code read off a text and typed by hand gets mistyped, and an
  // ambiguous character is a support problem forever.
  it('never uses characters that can be misread', () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateSignupCode()).not.toMatch(/[01OIL]/);
    }
  });

  it('does not repeat itself in any practical run', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(generateSignupCode());
    expect(seen.size).toBe(2000);
  });
});

describe('normalizeSignupCode', () => {
  // Accept what someone actually types off a text message.
  it('accepts lowercase, spaces and a missing hyphen', () => {
    for (const input of ['abcd-efgh', 'ABCDEFGH', 'abcd efgh', '  AbCd-EfGh  ']) {
      expect(normalizeSignupCode(input)).toBe('ABCD-EFGH');
    }
  });

  it('handles nothing without throwing', () => {
    expect(normalizeSignupCode('')).toBe('');
    expect(normalizeSignupCode(null)).toBe('');
    expect(normalizeSignupCode(undefined)).toBe('');
  });
});

describe('isValidSignupCode', () => {
  it('accepts a generated code in any typed form', () => {
    const code = generateSignupCode();
    expect(isValidSignupCode(code)).toBe(true);
    expect(isValidSignupCode(code.toLowerCase())).toBe(true);
    expect(isValidSignupCode(code.replace('-', ''))).toBe(true);
    expect(isValidSignupCode(` ${code} `)).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidSignupCode('ABC')).toBe(false);
    expect(isValidSignupCode('ABCD-EFGHI')).toBe(false);
    expect(isValidSignupCode('')).toBe(false);
  });

  // A code containing an ambiguous character was never generated, so it
  // can only be a mistype -- catching it locally saves a round trip.
  it('rejects characters the generator never produces', () => {
    expect(isValidSignupCode('ABCD-EFG0')).toBe(false);
    expect(isValidSignupCode('ABCD-EFGO')).toBe(false);
    expect(isValidSignupCode('1BCD-EFGH')).toBe(false);
  });
});
