import { describe, it, expect } from 'vitest';
import {
  emptyBag, normalizeBag, bagCapacity, bagHasRoom, describeCapacity,
  availableBalls, bagsForEnvironment, unassignedBalls, bagToRow, bagFromRow,
} from './bags.js';

describe('capacity and the plastic rule', () => {
  const fiveBag = { id: 'b1', bowlerName: 'Ryan', name: 'Short 5', bagType: 'tournament', ballLimit: '5', includesPlastic: false };

  it('treats a plastic allowance as sitting OUTSIDE the stated limit', () => {
    // Tournaments word this as "5 balls plus a plastic" -- the plastic
    // doesn't count against the 5, so the bag legitimately holds 6.
    expect(bagCapacity(fiveBag)).toBe(5);
    expect(bagCapacity({ ...fiveBag, includesPlastic: true })).toBe(6);
  });

  it('has no capacity limit when none is set', () => {
    expect(bagCapacity({ ballLimit: '' })).toBeNull();
  });

  it('describes capacity the way a bowler would say it', () => {
    expect(describeCapacity(fiveBag)).toBe('5 balls');
    expect(describeCapacity({ ...fiveBag, includesPlastic: true })).toBe('5 + plastic');
    expect(describeCapacity({ ballLimit: '' })).toBe('No limit');
  });

  it('leaves room for the plastic when the limit is otherwise full', () => {
    const byBag = { b1: ['A', 'B', 'C', 'D', 'E'] };
    expect(bagHasRoom(fiveBag, byBag)).toBe(false);
    expect(bagHasRoom({ ...fiveBag, includesPlastic: true }, byBag)).toBe(true);
  });

  it('an unlimited bag always has room', () => {
    expect(bagHasRoom({ id: 'x', ballLimit: '' }, { x: ['A', 'B', 'C', 'D', 'E', 'F'] })).toBe(true);
  });
});

describe('availableBalls', () => {
  const all = ['A', 'B', 'C', 'D', 'E', 'F', 'Unassigned1'];
  const ballsByBag = { league1: ['A', 'B', 'C'], tourn1: ['D', 'E'], tourn2: ['A', 'F'] };

  it('restricts league and tournament to the selected bag', () => {
    expect(availableBalls('league', ballsByBag, 'league1', all)).toEqual(['A', 'B', 'C']);
    expect(availableBalls('tournament', ballsByBag, 'tourn1', all)).toEqual(['D', 'E']);
  });

  it('gives practice every ball, including unassigned ones', () => {
    // Practice is where you try equipment that isn't packed for anything
    // yet, so constraining it to a bag would defeat the purpose.
    expect(availableBalls('practice', ballsByBag, null, all)).toEqual(all);
    expect(availableBalls('practice', ballsByBag, 'tourn1', all)).toEqual(all);
  });

  it('returns nothing when a competitive environment has no bag selected', () => {
    expect(availableBalls('league', ballsByBag, null, all)).toEqual([]);
  });
});

describe('bagsForEnvironment', () => {
  const bags = [
    { id: 'l1', bagType: 'league', name: 'League' },
    { id: 't1', bagType: 'tournament', name: 'Short 5' },
    { id: 't2', bagType: 'tournament', name: 'Long 6' },
  ];

  it('offers only bags matching the environment', () => {
    expect(bagsForEnvironment(bags, 'league').map(b => b.name)).toEqual(['League']);
    expect(bagsForEnvironment(bags, 'tournament').map(b => b.name)).toEqual(['Short 5', 'Long 6']);
  });

  it('offers no bags for practice, which is unconstrained', () => {
    expect(bagsForEnvironment(bags, 'practice')).toEqual([]);
  });
});

describe('unassignedBalls', () => {
  it('finds balls that are entered but not packed into any bag', () => {
    const all = ['A', 'B', 'C'];
    expect(unassignedBalls(all, { bag1: ['A'] })).toEqual(['B', 'C']);
  });
});

describe('supabase round trip', () => {
  it('preserves every field in both directions', () => {
    const full = { id: 'b9', bowlerName: 'Ryan', name: 'Short pattern 5 ball + plastic', bagType: 'tournament', ballLimit: '5', includesPlastic: true };
    expect(bagFromRow(bagToRow(full, 'u1'))).toEqual(full);
  });

  it('stores a blank limit as NULL rather than zero', () => {
    // Zero would mean "no balls allowed", which is very different from
    // "no limit set".
    expect(bagToRow({ ...emptyBag('Ryan'), ballLimit: '' }, 'u1').ball_limit).toBeNull();
  });
});

describe('normalizeBag robustness', () => {
  it('falls back to a league bag for an unrecognized type', () => {
    expect(normalizeBag({ bagType: 'nonsense' }).bagType).toBe('league');
  });

  it('coerces a numeric limit to a string so inputs stay controlled', () => {
    expect(normalizeBag({ ballLimit: 5 }).ballLimit).toBe('5');
  });
});
