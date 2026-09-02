import { describe, it, expect } from 'vitest';
import { computeSessionStats, findExistingShotSlot } from './sessions.js';

describe('computeSessionStats', () => {
  // A realistic mixed night: 2 strikes, a converted Weak 10, a converted
  // single-pin leave, and an unconverted 7-10 split.
  const nightShots = [
    { result: 'Strike', ball: 'Bionic', release: 'Good' },
    { result: 'Strike', ball: 'Bionic', release: 'Good' },
    { result: 'Weak 10', ball: 'Bionic', spareMade: 'Yes', release: 'Bad' },
    { result: 'Other Leave', otherLeave: ['7'], spareMade: 'Yes', ball: 'Phaze II', release: 'Good', miss: ['Left'] },
    { result: 'Other Leave', otherLeave: ['7', '10'], spareMade: 'No', ball: 'Phaze II', miss: ['Right', 'Fast'] },
  ];
  const stats = computeSessionStats(nightShots);

  it('counts every shot, including bonus balls', () => {
    expect(stats.shotCount).toBe(5);
  });

  it('counts strikes correctly', () => {
    expect(stats.strikes).toBe(2);
  });

  it('counts Weak 10 and Ringing 10 separately', () => {
    expect(stats.weakTens).toBe(1);
    expect(stats.ringingTens).toBe(0);
  });

  it('Weak 10 and a single numbered pin both count as ten-pin/single-pin leaves respectively', () => {
    expect(stats.tenPinLeaves).toBe(1); // only the Weak 10
    expect(stats.singlePinLeaves).toBe(2); // the Weak 10 AND the lone 7-pin leave
  });

  it('splits are counted, and excluded from spare attempts/makes — matching the app-wide Spare % convention', () => {
    expect(stats.splits).toBe(1); // the 7-10
    expect(stats.splitsConverted).toBe(0); // it wasn't made
    // Only the Weak 10 and the 7-pin leave count as spare attempts — the
    // split is deliberately excluded from both attempts and makes.
    expect(stats.spareAttempts).toBe(2);
    expect(stats.sparesMade).toBe(2);
  });

  it('deduplicates balls used', () => {
    expect(stats.ballsUsed).toEqual(['Bionic', 'Phaze II']);
  });

  it('flattens miss arrays across every shot', () => {
    expect(stats.misses).toEqual(['Left', 'Right', 'Fast']);
  });

  it('only includes releases from shots that actually recorded one', () => {
    expect(stats.releases).toEqual(['Good', 'Good', 'Bad', 'Good']);
  });

  it('an empty night produces all-zero stats, not undefined/NaN', () => {
    const empty = computeSessionStats([]);
    expect(empty.shotCount).toBe(0);
    expect(empty.strikes).toBe(0);
    expect(empty.ballsUsed).toEqual([]);
    expect(empty.misses).toEqual([]);
  });
});

describe('findExistingShotSlot', () => {
  const shots = [
    { id: 'a', bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '5', ballNum: null },
    { id: 'b', bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1 },
  ];

  it('finds an existing frame 1-9 slot', () => {
    const match = findExistingShotSlot(shots, { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '5', ballNum: null });
    expect(match?.id).toBe('a');
  });

  it('finds an existing 10th-frame ball slot', () => {
    const match = findExistingShotSlot(shots, { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1 });
    expect(match?.id).toBe('b');
  });

  it('does not match a different ball number in the same frame', () => {
    const match = findExistingShotSlot(shots, { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2 });
    expect(match).toBeUndefined();
  });

  it('does not match a different bowler, even with everything else identical', () => {
    const match = findExistingShotSlot(shots, { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '5', ballNum: null });
    expect(match).toBeUndefined();
  });

  it('does not match a different date', () => {
    const match = findExistingShotSlot(shots, { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-12', game: '1', frame: '5', ballNum: null });
    expect(match).toBeUndefined();
  });
});

