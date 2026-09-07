import { describe, it, expect } from 'vitest';
import {
  normalizeName, nameScore, bestNameScore, matchBowler, matchScorecard, AUTO_MATCH_SCORE,
} from './nameMatching.js';

const roster = [
  { bowler: 'Ryan Nadon', aliases: ['R. Nadon'], lineupPosition: 0 },
  { bowler: 'Kim Nadon', aliases: [], lineupPosition: 1 },
  { bowler: 'Dave Smith', aliases: [], lineupPosition: 2 },
];

describe('name comparison', () => {
  it('folds case and punctuation', () => {
    expect(normalizeName('R. Nadon')).toBe(normalizeName('r nadon'));
  });

  it('scores the common house-display shorthands', () => {
    expect(nameScore('Ryan Nadon', 'Ryan Nadon')).toBe(1);
    expect(nameScore('R. Nadon', 'Ryan Nadon')).toBe(0.9);
    expect(nameScore('Ryan N', 'Ryan Nadon')).toBe(0.85);
  });

  // One edit apart, completely different bowler. A fuzzy distance would
  // rate this highly, which is why this uses explicit rules instead.
  it('does not match a near-miss first name', () => {
    expect(nameScore('Bryan', 'Ryan')).toBeLessThan(AUTO_MATCH_SCORE);
  });

  it('treats a shared surname alone as weak', () => {
    expect(nameScore('K. Nadon', 'Ryan Nadon')).toBe(0.5);
  });
});

describe('aliases', () => {
  it('matches on an alias and reports which one', () => {
    const r = bestNameScore('R. NADON', 'Ryan Nadon', ['R. Nadon', 'RYAN N']);
    expect(r.score).toBe(1);
    expect(r.via).toBe('R. Nadon');
  });
});

describe('matching one column', () => {
  // Two family members on one team is common in league bowling.
  it('refuses to auto-match when two bowlers score equally', () => {
    const m = matchBowler('T. Nadon', roster);
    expect(m.ambiguous).toBe(true);
    expect(m.autoMatch).toBe(false);
  });

  it('auto-matches a confident alias hit', () => {
    expect(matchBowler('R. Nadon', roster, { columnIndex: 0 }).autoMatch).toBe(true);
  });

  // Lineup position corroborates a name; it never overrides one. A roster
  // typed in the wrong order would otherwise reassign everyone silently.
  it('lets the name win over lineup position', () => {
    const m = matchBowler('Dave Smith', roster, { columnIndex: 0 });
    expect(m.best.bowler).toBe('Dave Smith');
    expect(m.autoMatch).toBe(true);
  });
});

describe('matching a whole card', () => {
  it('assigns every column when all are clear', () => {
    const c = matchScorecard(['R. Nadon', 'Kim Nadon', 'Dave Smith'], roster);
    expect(c.needsReview).toBe(false);
    expect(c.columns.map(x => x.assigned)).toEqual(['Ryan Nadon', 'Kim Nadon', 'Dave Smith']);
  });

  it('leaves an unknown name for review rather than guessing', () => {
    const c = matchScorecard(['R. Nadon', 'Someone Else', 'Dave Smith'], roster);
    expect(c.columns[1].assigned).toBeNull();
    expect(c.needsReview).toBe(true);
  });

  it('never assigns one bowler to two columns', () => {
    const c = matchScorecard(['Ryan Nadon', 'R. Nadon'], roster);
    const assigned = c.columns.map(x => x.assigned).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(c.columns[0].assigned).toBe('Ryan Nadon');
  });

  it('is safe with no roster or no columns', () => {
    expect(matchBowler('Anyone', []).best).toBeNull();
    expect(matchScorecard(null, null).columns).toHaveLength(0);
  });
});
