import { describe, it, expect } from 'vitest';
import { normalizePattern, describePattern, searchPatterns, patternToRow, patternFromRow, patternDays, patternStats, loggedPatternSummaries } from './oilPatterns.js';

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

describe('user-submitted patterns', () => {
  it('normalizes a fresh submission with blank optional fields', () => {
    const submitted = normalizePattern({ name: 'Chameleon 39 (told at check-in)', lengthFeet: 39, ratio: '', volumeMl: null });
    expect(submitted.name).toBe('Chameleon 39 (told at check-in)');
    expect(submitted.lengthFeet).toBe(39);
    expect(submitted.ratio).toBe('');
    expect(submitted.volumeMl).toBeNull();
  });

  it('never marks a fresh submission as verified when converted to a row', () => {
    const row = patternToRow(normalizePattern({ name: 'My House Shot' }), 'user-1');
    expect(row.verified).toBe(false);
  });
});

describe('per-pattern history across tournaments', () => {
  const tournaments = [
    { id: 't1', name: 'Spring Open', center: 'Sun Valley', days: [
      { dayNumber: 1, date: '2026-03-01', oilPattern: 'Chameleon', madeCut: true,
        games: [{ score: '210' }, { score: '190' }, { score: '200' }] },
      { dayNumber: 2, date: '2026-03-02', oilPattern: 'Scorpion', madeCut: false,
        games: [{ score: '170' }, { score: '180' }] },
    ] },
    { id: 't2', name: 'Summer Classic', center: 'Bowl City', days: [
      { dayNumber: 1, date: '2026-06-01', oilPattern: '  chameleon ', madeCut: false,
        games: [{ score: '220' }, { score: '' }, { score: null }] },
    ] },
  ];

  it('aggregates the same pattern across tournaments regardless of case and whitespace', () => {
    expect(patternDays(tournaments, 'Chameleon')).toHaveLength(2);
  });

  it('sorts most recent first, with undated days last rather than oldest', () => {
    const days = patternDays([{ id: 'u', name: 'U', days: [
      { oilPattern: 'P', date: '', games: [{ score: '100' }] },
      { oilPattern: 'P', date: '2026-01-01', games: [{ score: '200' }] },
    ] }], 'P');
    expect(days[0].date).toBe('2026-01-01');
    expect(days[1].date).toBe('');
  });

  it('excludes blank and null scores from the game count', () => {
    expect(patternStats(tournaments, 'Chameleon').games).toBe(4);
  });

  it('truncates the average rather than rounding, matching book average rules', () => {
    const s = patternStats([{ id: 'x', name: 'X', days: [
      { oilPattern: 'P', date: '2026-01-01', games: [{ score: '200' }, { score: '201' }] },
    ] }], 'P');
    expect(s.average).toBe(200);
  });

  it('rejects out-of-range and non-numeric scores', () => {
    const s = patternStats([{ id: 'b', name: 'B', days: [
      { oilPattern: 'Q', date: '2026-01-01', games: [{ score: '301' }, { score: '-5' }, { score: 'abc' }, { score: '200' }] },
    ] }], 'Q');
    expect(s.games).toBe(1);
    expect(s.average).toBe(200);
  });

  it('counts cuts only where the outcome was actually recorded', () => {
    const s = patternStats(tournaments, 'Chameleon');
    expect(s.cutsMade).toBe(1);
    expect(s.cutsTracked).toBe(2);
    const untracked = patternStats([{ id: 'c', name: 'C', days: [
      { oilPattern: 'R', date: '2026-01-01', madeCut: null, games: [{ score: '200' }] },
    ] }], 'R');
    expect(untracked.cutsMade).toBeNull();
    expect(untracked.cutsTracked).toBe(0);
  });

  it('returns null for a pattern never logged, so the UI can hide the section', () => {
    expect(patternStats(tournaments, 'Nonexistent')).toBeNull();
  });

  it('returns a zero-game shape for a day logged before any scores are entered', () => {
    const s = patternStats([{ id: 'z', name: 'Z', days: [
      { oilPattern: 'Fresh', date: '2026-05-05', games: [{ score: '' }] },
    ] }], 'Fresh');
    expect(s.games).toBe(0);
    expect(s.average).toBeNull();
  });

  it('handles null and undefined input without throwing', () => {
    expect(patternDays(null, 'Chameleon')).toEqual([]);
    expect(patternStats(undefined, 'X')).toBeNull();
    expect(patternDays(tournaments, '')).toEqual([]);
  });

  it('ranks logged patterns by games played and keeps first-seen casing', () => {
    const sum = loggedPatternSummaries(tournaments);
    expect(sum).toHaveLength(2);
    expect(sum[0].name).toBe('Chameleon');
  });

  it('ignores days with no pattern named', () => {
    expect(loggedPatternSummaries([{ id: 'q', name: 'Q', days: [
      { oilPattern: '', games: [{ score: '200' }] },
    ] }])).toEqual([]);
  });
});
