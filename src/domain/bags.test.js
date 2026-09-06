import { describe, it, expect } from 'vitest';
import {
  emptyBag, normalizeBag, bagCapacity, bagHasRoom, describeCapacity,
  availableBalls, bagsForEnvironment, unassignedBalls, bagToRow, bagFromRow,
  toggleBallInBag, isBallInBag, removeBagMemberships, ballsByBagFor, bagsForBall,
} from './bags.js';

describe('capacity and the plastic rule', () => {
  const fiveBag = { id: 'b1', bowlerName: 'Ryan', name: 'Short 5', bagType: 'tournament', ballLimit: '5', includesPlastic: false };

  it('uses the stated limit as the exact total, with no hidden arithmetic', () => {
    // The limit IS the total the tournament allows. A bowler entering 6
    // decides for themselves whether that's 6 strike balls or 5 plus a
    // plastic -- adding a hidden +1 made the real limit ambiguous.
    expect(bagCapacity(fiveBag)).toBe(5);
    expect(bagCapacity({ ...fiveBag, includesPlastic: true })).toBe(5);
  });

  it('has no capacity limit when none is set', () => {
    expect(bagCapacity({ ballLimit: '' })).toBeNull();
  });

  it('describes capacity as a plain total', () => {
    expect(describeCapacity(fiveBag)).toBe('5 balls');
    // The plastic note is for the bowler's planning; it doesn't change
    // the number shown.
    expect(describeCapacity({ ...fiveBag, includesPlastic: true })).toBe('5 balls');
    expect(describeCapacity({ ballLimit: '' })).toBe('No limit');
  });

  it('is full at the stated limit regardless of the plastic note', () => {
    const byBag = { b1: ['A', 'B', 'C', 'D', 'E'] };
    expect(bagHasRoom(fiveBag, byBag)).toBe(false);
    expect(bagHasRoom({ ...fiveBag, includesPlastic: true }, byBag)).toBe(false);
  });

  it('an unlimited bag always has room', () => {
    expect(bagHasRoom({ id: 'x', ballLimit: '' }, { x: ['A', 'B', 'C', 'D', 'E', 'F'] })).toBe(true);
  });
});

describe('availableBalls', () => {
  const all = ['A', 'B', 'C', 'D', 'E', 'F', 'Unassigned1'];
  const ballsByBag = { league1: ['A', 'B', 'C'], tourn1: ['D', 'E'], tourn2: ['A', 'F'] };

  it('restricts league and tournament to the selected bag', () => {
    expect(availableBalls('league', ballsByBag, 'league1', all, true)).toEqual(['A', 'B', 'C']);
    expect(availableBalls('tournament', ballsByBag, 'tourn1', all, true)).toEqual(['D', 'E']);
  });

  it('gives practice every ball, including unassigned ones', () => {
    // Practice is where you try equipment that isn't packed for anything
    // yet, so constraining it to a bag would defeat the purpose.
    expect(availableBalls('practice', ballsByBag, null, all)).toEqual(all);
    expect(availableBalls('practice', ballsByBag, 'tourn1', all)).toEqual(all);
  });

  it('falls back to the whole arsenal when no bag is selected', () => {
    // Bags organise an arsenal; they don't gate it. A bowler who hasn't
    // picked one -- or hasn't created any -- must still be able to choose
    // a ball, which is how the app worked before bags existed.
    expect(availableBalls('league', ballsByBag, null, all, true)).toEqual(all);
  });

  it('ignores bags entirely for a bowler who has none', () => {
    expect(availableBalls('league', {}, '', all, false)).toEqual(all);
    expect(availableBalls('tournament', {}, '', all, false)).toEqual(all);
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

describe('a ball can live in many bags', () => {
  it('keeps one ball in several bags at once', () => {
    // A benchmark ball is commonly carried in the league bag AND every
    // tournament bag -- membership is many-to-many, not a single choice.
    let m = {};
    m = toggleBallInBag(m, 'Ryan', 'Phaze II', 'league1');
    m = toggleBallInBag(m, 'Ryan', 'Phaze II', 'tourn1');
    expect(isBallInBag(m, 'Ryan', 'Phaze II', 'league1')).toBe(true);
    expect(isBallInBag(m, 'Ryan', 'Phaze II', 'tourn1')).toBe(true);
  });

  it('removing a ball from one bag leaves it in the others', () => {
    let m = {};
    m = toggleBallInBag(m, 'Ryan', 'Phaze II', 'league1');
    m = toggleBallInBag(m, 'Ryan', 'Phaze II', 'tourn1');
    m = toggleBallInBag(m, 'Ryan', 'Phaze II', 'tourn1');
    expect(isBallInBag(m, 'Ryan', 'Phaze II', 'league1')).toBe(true);
    expect(isBallInBag(m, 'Ryan', 'Phaze II', 'tourn1')).toBe(false);
  });

  it('scopes membership per bowler', () => {
    let m = toggleBallInBag({}, 'Ryan', 'Phaze II', 'league1');
    expect(isBallInBag(m, 'Aaron', 'Phaze II', 'league1')).toBe(false);
  });

  it('deleting a bag clears only that bag\'s memberships', () => {
    let m = {};
    m = toggleBallInBag(m, 'Ryan', 'A', 'b1');
    m = toggleBallInBag(m, 'Ryan', 'A', 'b2');
    const after = removeBagMemberships(m, 'b1');
    expect(isBallInBag(after, 'Ryan', 'A', 'b1')).toBe(false);
    expect(isBallInBag(after, 'Ryan', 'A', 'b2')).toBe(true);
  });

  it('excludes balls the bowler no longer owns', () => {
    const m = toggleBallInBag({}, 'Ryan', 'Sold', 'b1');
    expect(ballsByBagFor(m, 'Ryan', ['Kept']).b1).toBeUndefined();
  });

  it('lists every bag a given ball is packed in', () => {
    let m = {};
    m = toggleBallInBag(m, 'Ryan', 'A', 'b1');
    m = toggleBallInBag(m, 'Ryan', 'A', 'b2');
    const bags = [{ id: 'b1', name: 'League' }, { id: 'b2', name: 'Short 5' }];
    expect(bagsForBall(m, 'Ryan', 'A', bags).map(b => b.name)).toEqual(['League', 'Short 5']);
  });
});
