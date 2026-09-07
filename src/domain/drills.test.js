import { describe, it, expect } from 'vitest';
import { emptyDrill, normalizeDrill, recordMade, recordMissed, undo, attempts, conversionRate, targetHistory,
  targetLabel,
  targetShortLabel,
  customPinKey,
  normalizeCustomPins,
  weeklyTargetHistory,
  weeklyTrend,
} from './drills.js';

describe('drill scoring', () => {
  it('reports no rate before any attempt, rather than 0%', () => {
    expect(conversionRate(emptyDrill('Ryan', '2026-09-06'))).toBeNull();
  });

  it('computes conversion from made and missed', () => {
    let d = recordMade(recordMade(recordMissed(emptyDrill('Ryan', '2026-09-06'))));
    expect(attempts(d)).toBe(3);
    expect(conversionRate(d)).toBe(67);
  });

  it('undoes the last tap without going negative', () => {
    let d = recordMade(emptyDrill('Ryan', '2026-09-06'));
    d = undo(d, true);
    d = undo(d, true);
    expect(d.made).toBe(0);
  });
});

describe('normalizeDrill', () => {
  it('coerces garbage counts to zero', () => {
    expect(normalizeDrill({ made: -5, missed: 'abc' })).toMatchObject({ made: 0, missed: 0 });
  });

  it('falls back to the 10 pin for an unknown target', () => {
    expect(normalizeDrill({ target: 'nonsense' }).target).toBe('10pin');
  });
});

describe('targetHistory', () => {
  it('returns one bowler\'s drills for one target, oldest first, skipping thin ones', () => {
    const drills = [
      { bowler: 'Ryan', date: '2026-09-08', target: '10pin', made: 8, missed: 2 },
      { bowler: 'Ryan', date: '2026-09-01', target: '10pin', made: 6, missed: 4 },
      { bowler: 'Ryan', date: '2026-09-03', target: '10pin', made: 2, missed: 1 },
      { bowler: 'Aaron', date: '2026-09-01', target: '10pin', made: 10, missed: 0 },
    ];
    const h = targetHistory(drills, 'Ryan', '10pin');
    expect(h.map(x => x.rate)).toEqual([60, 80]);
  });
});

// A lefty's ball approaches the pocket from the opposite side, so a
// combo named for a righty's near-side shape is a different geometry for
// her -- her equivalent is its mirror. The stored id stays canonical for
// both hands (so history and cross-bowler comparison keep working off
// one identifier); only the label a lefty sees should flip.
describe('hand-aware target labels', () => {
  it('mirrors the two combos that have no already-listed counterpart', () => {
    expect(targetLabel('3-6-10', '', true)).toBe('2-4-7 (bucket-ish)');
    expect(targetLabel('2-4-5', '', true)).toBe('3-5-6 (bucket)');
  });

  it('leaves a righty\'s label as the canonical text', () => {
    expect(targetLabel('3-6-10', '', false)).toBe('3-6-10 (bucket-ish)');
  });

  // 6-10 and 4-7 already mirror each other as two SEPARATE listed
  // choices, and so do every single pin (7pin/10pin, 4pin/6pin,
  // 2pin/3pin) -- relabeling any of those would show the same pins
  // twice under two different names.
  it('does not relabel targets whose mirror is already a separate option', () => {
    expect(targetLabel('6-10', '', true)).toBe('6-10');
    expect(targetLabel('4-7', '', true)).toBe('4-7');
    expect(targetLabel('10pin', '', true)).toBe('10 Pin');
    expect(targetLabel('7pin', '', false)).toBe('7 Pin');
  });

  it('mirrors the picker\'s short chip label the same way', () => {
    expect(targetShortLabel('3-6-10', true)).toBe('2-4-7');
    expect(targetShortLabel('2-4-5', false)).toBe('2-4-5');
  });

  it('starts a fresh drill on the bowler\'s own corner', () => {
    expect(emptyDrill('Dee', '2026-06-02', true).target).toBe('7pin');
    expect(emptyDrill('Ryan', '2026-06-02', false).target).toBe('10pin');
  });
});

// Free-text custom targets could never be compared with anyone else's,
// and a lefty's version of a shape never matched a righty's at all.
// Naming the pins fixes both.
describe('pin-based custom targets', () => {
  it('labels from pins, with or without a name', () => {
    expect(targetLabel('custom', '', false, ['6', '3', '10'])).toBe('3-6-10');
    expect(targetLabel('custom', 'Bucket', false, ['2', '4', '5'])).toBe('Bucket (2-4-5)');
  });

  it('still supports a name-only custom target', () => {
    expect(targetLabel('custom', 'Greek Church', false, [])).toBe('Greek Church');
    expect(targetLabel('custom', '', false, [])).toBe('Custom');
  });

  it('dedupes, sorts, and drops junk pins', () => {
    expect(normalizeCustomPins(['3', '3', '6', 'x', '11', '0'])).toEqual(['3', '6']);
  });

  // The point: same abstract drill, mirrored pins, one key.
  it('gives a lefty and a righty the same key for mirrored pin sets', () => {
    expect(customPinKey(['2', '4', '7'], true)).toBe(customPinKey(['3', '6', '10'], false));
  });

  it('does not collide unrelated pin sets', () => {
    expect(customPinKey(['2', '4', '5'], false)).not.toBe(customPinKey(['3', '6', '10'], false));
  });
});

// A list of one-off session percentages is noise over a season. Weekly
// buckets pool attempts so a 2-attempt night can't swing a week as hard
// as a 40-attempt one.
describe('weekly drill history', () => {
  const mk = (date, made, missed) => ({ bowler: 'R', date, target: '10pin', made, missed, customPins: [] });
  const drills = [mk('2026-06-01', 5, 5), mk('2026-06-03', 6, 4), mk('2026-06-08', 7, 3),
    mk('2026-06-15', 8, 2), mk('2026-06-22', 9, 1)];

  it('pools drills bowled in the same week', () => {
    const w = weeklyTargetHistory(drills, 'R', '10pin');
    expect(w[0].sessions).toBe(2);
    expect(w[0].attempts).toBe(20);
  });

  it('computes the rate from pooled attempts, not averaged percentages', () => {
    expect(weeklyTargetHistory(drills, 'R', '10pin')[0].rate).toBe(55);
  });

  it('flags a thin week rather than dropping it', () => {
    expect(weeklyTargetHistory([mk('2026-06-01', 1, 1)], 'R', '10pin')[0].thin).toBe(true);
  });

  it('reports direction only with enough usable weeks', () => {
    expect(weeklyTrend(weeklyTargetHistory(drills, 'R', '10pin')).direction).toBe('up');
    expect(weeklyTrend(weeklyTargetHistory(drills.slice(0, 2), 'R', '10pin')).direction).toBe('unknown');
  });

  it('calls a small change steady rather than inventing a story', () => {
    const flat = [mk('2026-06-01', 5, 5), mk('2026-06-08', 5, 5), mk('2026-06-15', 5, 5), mk('2026-06-22', 5, 5)];
    expect(weeklyTrend(weeklyTargetHistory(flat, 'R', '10pin')).direction).toBe('steady');
  });
});
