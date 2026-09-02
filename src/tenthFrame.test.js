import { describe, it, expect } from 'vitest';
import { nextState, tenthFrameStatus } from './BowlingTracker.jsx';

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
