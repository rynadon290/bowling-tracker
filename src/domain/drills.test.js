import { describe, it, expect } from 'vitest';
import { emptyDrill, normalizeDrill, recordMade, recordMissed, undo, attempts, conversionRate, targetHistory,
  targetLabel,
  targetShortLabel,
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
