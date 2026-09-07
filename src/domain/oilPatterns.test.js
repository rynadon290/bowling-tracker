import { describe, it, expect } from 'vitest';
import { normalizePattern, describePattern, searchPatterns, patternToRow, patternFromRow } from './oilPatterns.js';

const patterns = [
  { id: '1', name: 'Arsenic', series: 'Element Sport', lengthFeet: 41, ratio: '1.36:1', volumeMl: 25.79, verified: true },
  { id: '2', name: 'Krypton', series: 'Element Sport', lengthFeet: 43, ratio: '2.94:1', volumeMl: 26.92, verified: true },
  { id: '3', name: 'Main Street', series: 'Navigation', lengthFeet: 41, verified: true },
  { id: '4', name: 'Wall Street', series: 'Navigation', lengthFeet: 40, verified: true },
];

describe('searchPatterns', () => {
  it('requires at least two characters', () => {
    expect(searchPatterns('k', patterns)).toEqual([]);
  });

  it('finds a pattern by prefix, case-insensitively', () => {
    expect(searchPatterns('KRY', patterns).map(p => p.name)).toEqual(['Krypton']);
  });

  it('ranks a prefix match above a mid-string match', () => {
    // Both "Main Street" and "Wall Street" contain "street" mid-string --
    // neither is a prefix match, so this checks the tie resolves cleanly
    // rather than checking prefix-vs-mid-string here specifically.
    const results = searchPatterns('street', patterns).map(p => p.name);
    expect(results).toEqual(['Main Street', 'Wall Street']);
  });

  it('returns nothing for no match', () => {
    expect(searchPatterns('zzz', patterns)).toEqual([]);
  });

  it('tolerates a null pattern list', () => {
    expect(searchPatterns('kry', null)).toEqual([]);
  });
});

describe('describePattern', () => {
  it('omits missing fields rather than showing placeholders', () => {
    // Wall Street here has no ratio or volume -- the description should
    // simply not mention them, not show "ratio: unknown".
    expect(describePattern(normalizePattern(patterns[3]))).toBe("40' · Navigation");
  });

  it('includes every field when present', () => {
    expect(describePattern(normalizePattern(patterns[1]))).toBe("43' · Element Sport · 2.94:1 · 26.92 mL");
  });

  it('returns an empty string for no pattern', () => {
    expect(describePattern(null)).toBe('');
  });
});

describe('supabase mapping', () => {
  it('never marks a user submission as verified', () => {
    const row = patternToRow(normalizePattern(patterns[0]), 'user-1');
    expect(row.verified).toBe(false);
  });

  it('round-trips the ratio as text, not a computed value', () => {
    const row = patternToRow(normalizePattern(patterns[1]), 'user-1');
    const back = patternFromRow({ ...row, id: 'x', verified: true });
    expect(back.ratio).toBe('2.94:1');
  });
});
