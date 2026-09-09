import { describe, it, expect } from 'vitest';
import { sessionMoney, totalMoney, sessionHighGame,
  buyInsForLeague,
  costArraysFor,
} from './money.js';

describe('sessionMoney', () => {
  // A good night: won the quarter game once, the dollar game once, took
  // the High Game Pot in game 3, and hit 3-6-9 with the jackpot.
  const goodNight = {
    scores: [200, 180, 210],
    pokerQuarter: [1, 0, 0], pokerQuarterCost: [0.25, 0.25, 0.25],
    pokerDollar: [0, 5, 0], pokerDollarCost: [1, 1, 1],
    highGameWinnings: [0, 0, 20], highGameCost: [2, 2, 2],
    threeSixNineWinnings: 15, jackpotWinnings: 10, threeSixNineCost: 5,
  };
  const m = sessionMoney(goodNight);

  it('sums poker across both the quarter and dollar games', () => {
    expect(m.poker.gross).toBe(6);
    expect(m.poker.cost).toBe(3.75);
    expect(m.poker.net).toBe(2.25);
  });

  it('treats High Game Pot as per-game, like poker', () => {
    expect(m.highGame.gross).toBe(20);
    expect(m.highGame.cost).toBe(6); // entered all three games
    expect(m.highGame.net).toBe(14);
  });

  it('folds the 3-6-9 jackpot into winnings without adding a second buy-in', () => {
    // The jackpot rides on the same entry -- it pays out more, but it
    // isn't a separately-purchased game.
    expect(m.threeSixNine.gross).toBe(25);
    expect(m.threeSixNine.cost).toBe(5);
  });

  it('rolls everything into a session gross/cost/net', () => {
    expect(m.gross).toBe(51);
    expect(m.cost).toBe(14.75);
    expect(m.net).toBe(36.25);
  });

  it('reports a negative net on a night that paid in and won nothing', () => {
    const badNight = {
      scores: [150, 150, 150],
      pokerQuarterCost: [0.25, 0.25, 0.25], pokerDollarCost: [1, 1, 1],
      highGameCost: [2, 2, 2], threeSixNineCost: 5,
    };
    expect(sessionMoney(badNight).net).toBe(-14.75);
  });

  it('produces zeros, not NaN, for a session with no money fields at all', () => {
    const m3 = sessionMoney({ scores: [100, 100, 100] });
    expect(m3.gross).toBe(0);
    expect(m3.cost).toBe(0);
    expect(m3.net).toBe(0);
  });

  it('returns null for a missing session', () => {
    expect(sessionMoney(null)).toBeNull();
  });
});

describe('totalMoney', () => {
  const a = { scores: [200], pokerQuarter: [1, 0, 0], pokerQuarterCost: [0.25, 0, 0] };
  const b = { scores: [180], pokerQuarter: [0, 0, 0], pokerQuarterCost: [0.25, 0, 0] };

  it('accumulates gross, cost, and net across sessions', () => {
    const t = totalMoney([a, b]);
    expect(t.gross).toBe(1);
    expect(t.cost).toBe(0.5);
    expect(t.net).toBe(0.5);
  });

  it('rolls up per-game-type totals too, not just the overall figure', () => {
    expect(totalMoney([a, b]).poker.net).toBe(0.5);
  });

  it('an empty list totals to zero rather than NaN or null', () => {
    expect(totalMoney([]).net).toBe(0);
  });
});

describe('sessionHighGame', () => {
  it('returns the best single game of the night', () => {
    expect(sessionHighGame({ scores: [200, 180, 210] })).toBe(210);
  });

  it('returns null when there are no scores yet', () => {
    expect(sessionHighGame({ scores: [] })).toBeNull();
  });
});

// Buy-ins are a property of the LEAGUE, not of each game or each week:
// the quarter game costs a quarter every game all season. Entering the
// same three numbers into nine boxes weekly was repetition whose most
// likely outcome is one of them being wrong.
describe('buyInsForLeague', () => {
  it('defaults to a quarter and a dollar per game', () => {
    const r = buyInsForLeague({}, 'Tuesday House Shot');
    expect(r.pokerQuarter).toBe(0.25);
    expect(r.pokerDollar).toBe(1);
  });

  it('uses a saved rate over the default', () => {
    const r = buyInsForLeague({ 'Tuesday House Shot': { pokerQuarter: 0.5 } }, 'Tuesday House Shot');
    expect(r.pokerQuarter).toBe(0.5);
    expect(r.pokerDollar).toBe(1); // unsaved fields still default
  });

  // A saved 0 is a real answer ("this league has no high-game pot"), not
  // an absent value -- ?? rather than || matters here.
  it('respects a saved zero instead of falling back to the default', () => {
    const r = buyInsForLeague({ L: { pokerQuarter: 0 } }, 'L');
    expect(r.pokerQuarter).toBe(0);
  });

  it('is per league, not global', () => {
    const saved = { A: { pokerDollar: 2 }, B: { pokerDollar: 5 } };
    expect(buyInsForLeague(saved, 'A').pokerDollar).toBe(2);
    expect(buyInsForLeague(saved, 'B').pokerDollar).toBe(5);
  });
});

describe('costArraysFor', () => {
  const rates = { pokerQuarter: 0.25, pokerDollar: 1, highGame: 2, threeSixNine: 5 };

  it('charges each game bowled', () => {
    expect(costArraysFor(rates, 3).pokerQuarterCost).toEqual([0.25, 0.25, 0.25]);
    expect(costArraysFor(rates, 3).pokerDollarCost).toEqual([1, 1, 1]);
  });

  // Charging for a game that wasn't bowled would quietly overstate what
  // the night cost, which is the whole number this feature exists to get
  // right.
  it('does not charge for games that were not bowled', () => {
    expect(costArraysFor(rates, 1).pokerQuarterCost).toEqual([0.25, 0, 0]);
    expect(costArraysFor(rates, 0).pokerDollarCost).toEqual([0, 0, 0]);
  });

  it('treats 3-6-9 as one whole-night cost, not per game', () => {
    expect(costArraysFor(rates, 3).threeSixNineCost).toBe(5);
    expect(costArraysFor(rates, 1).threeSixNineCost).toBe(5);
  });

  it('never produces more than three games', () => {
    expect(costArraysFor(rates, 99).pokerQuarterCost).toHaveLength(3);
  });

  // The arrays must be exactly what sessionMoney already reads, or the
  // pre-fill would silently not reach the totals.
  it('feeds sessionMoney correctly', () => {
    const session = {
      pokerQuarter: [0, 0, 0], pokerDollar: [0, 0, 0],
      highGameWinnings: [0, 0, 0], threeSixNineWinnings: 0, jackpotWinnings: 0,
      ...costArraysFor({ pokerQuarter: 0.25, pokerDollar: 1, highGame: 0, threeSixNine: 0 }, 3),
    };
    // 3 games x (0.25 + 1) = 3.75 paid in, nothing won.
    expect(sessionMoney(session).cost).toBeCloseTo(3.75, 2);
    expect(sessionMoney(session).net).toBeCloseTo(-3.75, 2);
  });
});

// Saving a buy-in rate used to mean paying it every week forever: the
// app assumed the bowler was in every pot every night, so a week they
// sat one out silently charged them for it and net winnings drifted
// from reality with nothing on screen to explain why.
describe('costArraysFor participation', () => {
  const rates = { pokerQuarter: 0.25, pokerDollar: 1, highGame: 2, threeSixNine: 5 };

  // Null means "all of them", which is what keeps every existing caller
  // and every already-saved session behaving exactly as before.
  it('charges every pot when participation is not specified', () => {
    const c = costArraysFor(rates, 3);
    expect(c.pokerDollarCost).toEqual([1, 1, 1]);
    expect(c.threeSixNineCost).toBe(5);
  });

  it('charges nothing for a pot the bowler sat out', () => {
    const c = costArraysFor(rates, 3, {
      pokerQuarter: true, pokerDollar: false, highGame: true, threeSixNine: false,
    });
    expect(c.pokerQuarterCost).toEqual([0.25, 0.25, 0.25]);
    expect(c.pokerDollarCost).toEqual([0, 0, 0]);
    expect(c.threeSixNineCost).toBe(0);
  });

  it('still respects games bowled for pots they are in', () => {
    const c = costArraysFor(rates, 1, { pokerQuarter: true, pokerDollar: true, highGame: false, threeSixNine: true });
    expect(c.pokerQuarterCost).toEqual([0.25, 0, 0]);
    expect(c.highGameCost).toEqual([0, 0, 0]);
  });
});
