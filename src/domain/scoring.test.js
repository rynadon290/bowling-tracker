import { describe, it, expect } from 'vitest';
import { nextState, tenthFrameStatus, strictPartial, frameQualityScore, makeTheoreticalShots } from './scoring.js';

describe('tenthFrameStatus', () => {
  it('returns [1] for a brand-new 10th frame with no shots yet', () => {
    const shots = [];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([1]);
  });

  // Regression test for the actual reported bug: a completed 10th frame
  // from a DIFFERENT night, sharing the same bowler + game number, was
  // contaminating a brand-new frame's ball selector — causing it to jump
  // straight to ball 3 without ever offering ball 1 or 2.
  it('REGRESSION: a completed frame from a different night does not leak into tonight\'s fresh frame', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-14', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-14', game: '1', frame: '10', ballNum: 2, result: 'Strike' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-14', game: '1', frame: '10', ballNum: 3, result: 'Weak 10' },
    ];
    // Tonight (a different date) has zero shots yet for Game 1 Frame 10.
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([1]);
  });

  // Regression test for the second reported symptom: a genuine double
  // strike TONIGHT earning a real 3rd ball must not get swallowed by
  // unrelated data from another night sharing the same game number.
  it('REGRESSION: a genuine double-strike tonight still earns ball 3 despite unrelated old-night data', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-14', game: '1', frame: '10', ballNum: 1, result: 'Other Leave', spareMade: 'No' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2, result: 'Strike' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([3]);
  });

  it('a different LEAGUE on the same date/game number does not cross-contaminate either', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Tuesday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Ryan', league: 'Tuesday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2, result: 'Strike' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([1]);
  });

  it('a different BOWLER sharing everything else does not cross-contaminate', () => {
    const shots = [
      { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2, result: 'Strike' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([1]);
  });

  it('ball 1 strike, ball 2 not yet played -> offers only ball 2', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([2]);
  });

  it('ball 1 strike, ball 2 NOT a strike -> frame is complete, no ball 3 (ball 2 bundles its own spare attempt)', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2, result: 'Other Leave', spareMade: 'Yes' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([]);
  });

  it('ball 1 leaves pins, spare made -> earns a bonus ball 3', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Other Leave', spareMade: 'Yes' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([3]);
  });

  it('ball 1 open (no spare) -> frame is complete, no bonus ball', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Other Leave', spareMade: 'No' },
    ];
    expect(tenthFrameStatus(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1')).toEqual([]);
  });
});

describe('nextState', () => {
  it('frames 1-9 simply advance to the next frame', () => {
    expect(nextState([], 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '5', null))
      .toEqual({ game: '1', frame: '6', ballNum: null });
  });

  it('advancing from frame 9 to frame 10 sets ballNum to 1, not null', () => {
    // A null here previously caused the 10th-frame ball selector to go
    // unrecognized and loop back to "Ball 1" forever.
    expect(nextState([], 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '9', null))
      .toEqual({ game: '1', frame: '10', ballNum: 1 });
  });

  it('after saving 10th-frame ball 1 as a strike, advances to ball 2', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
    ];
    expect(nextState(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '10', 1))
      .toEqual({ game: '1', frame: '10', ballNum: 2 });
  });

  it('after saving 10th-frame ball 2 as a strike (following ball 1 strike), advances to ball 3', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2, result: 'Strike' },
    ];
    expect(nextState(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '10', 2))
      .toEqual({ game: '1', frame: '10', ballNum: 3 });
  });

  it('after saving 10th-frame ball 2 as NOT a strike, moves on to the next game', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Strike' },
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 2, result: 'Other Leave', spareMade: 'Yes' },
    ];
    expect(nextState(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '10', 2))
      .toEqual({ game: '2', frame: '1', ballNum: null });
  });

  it('after saving 10th-frame ball 3, always moves to the next game', () => {
    const shots = [];
    expect(nextState(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '10', 3))
      .toEqual({ game: '2', frame: '1', ballNum: null });
  });

  it('an open ball 1 in the 10th (spareMade No) ends the game immediately, no ball 2', () => {
    const shots = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-11', game: '1', frame: '10', ballNum: 1, result: 'Other Leave', spareMade: 'No' },
    ];
    expect(nextState(shots, 'Ryan', 'Thursday House Shot', '2026-09-11', '1', '10', 1))
      .toEqual({ game: '2', frame: '1', ballNum: null });
  });
});


function frame(n, fields) {
  return { frame: String(n), ballNum: null, ...fields };
}
function tenthBall(n, fields) {
  return { frame: '10', ballNum: n, ...fields };
}

describe('strictPartial — full game scoring', () => {
  it('a perfect game (12 strikes) scores 300', () => {
    const shots = [];
    for (let f = 1; f <= 9; f++) shots.push(frame(f, { result: 'Strike' }));
    shots.push(tenthBall(1, { result: 'Strike' }));
    shots.push(tenthBall(2, { result: 'Strike' }));
    shots.push(tenthBall(3, { result: 'Strike' }));
    expect(strictPartial(shots)).toBe(300);
  });

  it('every frame open at 9 pins (no strikes/spares ever triggering a bonus) scores 90', () => {
    const shots = [];
    for (let f = 1; f <= 9; f++) {
      shots.push(frame(f, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }));
    }
    shots.push(tenthBall(1, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }));
    expect(strictPartial(shots)).toBe(90);
  });

  it('a mix of strikes, a single-pin spare, and an open 10th resolves to a real total', () => {
    const shots = [];
    for (let f = 1; f <= 8; f++) shots.push(frame(f, { result: 'Strike' }));
    shots.push(frame(9, { result: 'Other Leave', otherLeave: ['5'], spareMade: 'Yes' }));
    shots.push(tenthBall(1, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }));
    expect(strictPartial(shots)).toBe(257);
  });

  it('an empty game returns null, not zero', () => {
    expect(strictPartial([])).toBeNull();
  });

  it('a single open frame missing its pin count is genuinely incomplete and returns null', () => {
    const shots = [frame(1, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '' })];
    expect(strictPartial(shots)).toBeNull();
  });

  it('a strike followed by a frame whose spare outcome is not yet decided returns null for both', () => {
    // Frame 1 (strike) needs frame 2 as its bonus, but frame 2's own
    // spareMade hasn't been chosen yet — neither frame can resolve.
    const shots = [
      frame(1, { result: 'Strike' }),
      frame(2, { result: 'Other Leave', otherLeave: ['7', '8'], spareMade: '' }),
    ];
    expect(strictPartial(shots)).toBeNull();
  });
});


function leave(pins, spareMade) {
  return { result: 'Other Leave', otherLeave: pins, spareMade };
}

describe('frameQualityScore — strict tier ordering', () => {
  it('a strike always scores exactly 100', () => {
    expect(frameQualityScore({ result: 'Strike' })).toBe(100);
  });

  it('a non-split spare scores in the 70-89 band', () => {
    const score = frameQualityScore(leave(['7'], 'Yes'));
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(89);
  });

  it('a split spare scores in the 50-69 band, strictly below any non-split spare', () => {
    const splitSpare = frameQualityScore(leave(['7', '10'], 'Yes'));
    const nonSplitSpare = frameQualityScore(leave(['7'], 'Yes'));
    expect(splitSpare).toBeGreaterThanOrEqual(50);
    expect(splitSpare).toBeLessThanOrEqual(69);
    expect(splitSpare).toBeLessThan(nonSplitSpare);
  });

  it('no open frame can ever outscore any spare, regardless of pin count', () => {
    const bestPossibleOpen = frameQualityScore({ result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' });
    const worstPossibleSplitSpare = frameQualityScore(leave(['7', '10'], 'Yes'));
    expect(bestPossibleOpen).toBeLessThan(worstPossibleSplitSpare);
  });

  it('within the non-split spare tier, fewer pins left standing on ball 1 scores higher', () => {
    // 7 alone: first ball = 9 (only 1 pin left standing).
    // 2-8 together: first ball = 8 (2 pins left standing) — confirmed
    // non-split (same column, no gap), so this is a clean same-tier
    // comparison isolating just the pin-count effect.
    const oneStanding = frameQualityScore(leave(['7'], 'Yes'));
    const twoStandingNonSplit = frameQualityScore(leave(['2', '8'], 'Yes'));
    expect(oneStanding).toBeGreaterThan(twoStandingNonSplit);
    expect(twoStandingNonSplit).toBeGreaterThanOrEqual(70);
    expect(twoStandingNonSplit).toBeLessThanOrEqual(89);
  });
});

describe('makeTheoreticalShots', () => {
  function frame(f, opts) { return { frame: String(f), ballNum: null, ...opts }; }

  it('converts a makeable missed spare in a regular frame', () => {
    const shots = [frame(5, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' })];
    const result = makeTheoreticalShots(shots, false, null);
    expect(result[0].spareMade).toBe('Yes');
  });

  it('does NOT convert a washout (headpin + 6/10, 3-pin down)', () => {
    const shots = [frame(5, { result: 'Other Leave', otherLeave: ['1', '6'], spareMade: 'No', pinCount: '2' })];
    const result = makeTheoreticalShots(shots, false, null);
    expect(result[0].spareMade).toBe('No');
  });

  it('does NOT convert a split (e.g. 7-10)', () => {
    const shots = [frame(9, { result: 'Other Leave', otherLeave: ['7', '10'], spareMade: 'No', pinCount: '8' })];
    const result = makeTheoreticalShots(shots, false, null);
    expect(result[0].spareMade).toBe('No');
  });

  it('leaves an already-made spare unchanged', () => {
    const shots = [frame(3, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'Yes', pinCount: '10' })];
    const result = makeTheoreticalShots(shots, false, null);
    expect(result[0]).toEqual(shots[0]);
  });

  it('leaves a strike unchanged', () => {
    const shots = [frame(1, { result: 'Strike' })];
    const result = makeTheoreticalShots(shots, false, null);
    expect(result[0]).toEqual(shots[0]);
  });

  it('respects handedness: a righty washout (1-6) is NOT a washout for a lefty, so it converts', () => {
    const shots = [frame(5, { result: 'Other Leave', otherLeave: ['1', '6'], spareMade: 'No', pinCount: '2' })];
    const result = makeTheoreticalShots(shots, true, null); // leftHanded=true
    expect(result[0].spareMade).toBe('Yes');
  });

  it('respects handedness: a lefty washout (1-7, 2-pin down) is correctly excluded for a lefty', () => {
    const shots = [frame(5, { result: 'Other Leave', otherLeave: ['1', '7'], spareMade: 'No', pinCount: '2' })];
    const result = makeTheoreticalShots(shots, true, null);
    expect(result[0].spareMade).toBe('No');
  });

  describe('10th frame handling', () => {
    it('does NOT convert the 10th frame when avgFirstBall is not supplied (would be unscoreable)', () => {
      const shots = [frame(10, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9', ballNum: 1 })];
      const result = makeTheoreticalShots(shots, false, null);
      expect(result.find(s => s.ballNum === 1).spareMade).toBe('No');
      expect(result.some(s => s.ballNum === 3)).toBe(false); // no synthetic fill ball added
    });

    it('converts the 10th frame and synthesizes a fill ball when avgFirstBall IS supplied', () => {
      const shots = [frame(10, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9', ballNum: 1 })];
      const result = makeTheoreticalShots(shots, false, 8.7);
      const b1 = result.find(s => s.ballNum === 1);
      const b3 = result.find(s => s.ballNum === 3);
      expect(b1.spareMade).toBe('Yes');
      expect(b3).toBeTruthy();
      expect(b3.pinCount).toBe('8'); // floored, not rounded
    });

    it('does not add a synthetic fill ball when the 10th frame already has real ball 2/3 data', () => {
      const shots = [
        frame(10, { result: 'Strike', ballNum: 1 }),
        frame(10, { result: 'Strike', ballNum: 2 }),
        frame(10, { result: 'Weak 10', ballNum: 3, spareMade: 'No' }),
      ];
      const result = makeTheoreticalShots(shots, false, 9);
      // No synthetic 4th ball added -- still exactly 3 real shots for frame 10
      expect(result.filter(s => parseInt(s.frame) === 10).length).toBe(3);
      // The real ball 3 (a makeable Weak 10 miss) IS still theoretically
      // converted, same as any other makeable miss anywhere in the game --
      // it's a genuine, already-known result, not an unknowable
      // hypothetical like a never-thrown fill ball would be
      expect(result.find(s => s.ballNum === 3).spareMade).toBe('Yes');
    });

    it('does NOT convert the 10th frame if the first ball is unmakeable (split/washout), even with avgFirstBall supplied', () => {
      const shots = [frame(10, { result: 'Other Leave', otherLeave: ['7', '10'], spareMade: 'No', pinCount: '8', ballNum: 1 })];
      const result = makeTheoreticalShots(shots, false, 9);
      expect(result.find(s => s.ballNum === 1).spareMade).toBe('No');
      expect(result.some(s => s.ballNum === 3)).toBe(false);
    });
  });

  it('end-to-end: a mixed game scores strictly higher after theoretical conversion, and strictPartial fully resolves it', () => {
    const shots = [
      frame(1, { result: 'Strike' }),
      frame(2, { result: 'Strike' }),
      frame(3, { result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' }), // makeable, converts
      frame(4, { result: 'Strike' }),
      frame(5, { result: 'Other Leave', otherLeave: ['7', '10'], spareMade: 'No', pinCount: '8' }), // split, stays open
      frame(6, { result: 'Strike' }),
      frame(7, { result: 'Strike' }),
      frame(8, { result: 'Strike' }),
      frame(9, { result: 'Strike' }),
      frame(10, { result: 'Strike', ballNum: 1 }),
      frame(10, { result: 'Strike', ballNum: 2 }),
      frame(10, { result: 'Strike', ballNum: 3 }),
    ];
    const actual = strictPartial(shots);
    const theoretical = makeTheoreticalShots(shots, false, 9);
    const theoreticalScore = strictPartial(theoretical);
    expect(theoreticalScore).not.toBeNull();
    expect(theoreticalScore).toBeGreaterThan(actual);
  });
});
