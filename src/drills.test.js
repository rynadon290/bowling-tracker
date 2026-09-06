import { describe, it, expect } from 'vitest';
import { emptyDrill, normalizeDrill, recordMade, recordMissed, undo, attempts, conversionRate, targetHistory } from './drills.js';

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
