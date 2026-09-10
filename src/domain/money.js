// Money-game accounting -- gross winnings, buy-in costs, and net.
//
// Kept in one place because "net" is easy to get subtly wrong when the
// games have different shapes: poker and High Game Pot are PER GAME (three
// buy-ins and three potential payouts a night), while 3-6-9 is a single
// whole-session pot with an optional jackpot on top. Summing those
// correctly matters more than it looks, and it's the kind of arithmetic
// worth testing rather than inlining into a view.
//
// Costs are what the bowler PAID to enter. A game that was never entered
// has zero cost and zero winnings, which nets to zero -- not a loss.

const EMPTY3 = [0, 0, 0];

function sum3(arr) {
  return (Array.isArray(arr) ? arr : EMPTY3).reduce((a, b) => a + (Number(b) || 0), 0);
}

function num(v) {
  return Number(v) || 0;
}

// One session's money picture, broken out by game type so the UI can show
// which games actually earned their buy-in and which didn't.
export function sessionMoney(session) {
  if (!session) return null;

  const pokerWon = sum3(session.pokerQuarter) + sum3(session.pokerDollar);
  const pokerCost = sum3(session.pokerQuarterCost) + sum3(session.pokerDollarCost);

  const highGameWon = sum3(session.highGameWinnings);
  const highGameCost = sum3(session.highGameCost);

  // 3-6-9 is one session-wide pot; the jackpot is a separate payout that
  // rides on the same entry, so it adds to winnings without adding cost.
  const threeSixNineWon = num(session.threeSixNineWinnings) + num(session.jackpotWinnings);
  const threeSixNineCost = num(session.threeSixNineCost);

  const gross = pokerWon + highGameWon + threeSixNineWon;
  const cost = pokerCost + highGameCost + threeSixNineCost;

  return {
    poker: { gross: pokerWon, cost: pokerCost, net: pokerWon - pokerCost },
    highGame: { gross: highGameWon, cost: highGameCost, net: highGameWon - highGameCost },
    threeSixNine: { gross: threeSixNineWon, cost: threeSixNineCost, net: threeSixNineWon - threeSixNineCost },
    gross,
    cost,
    net: gross - cost,
  };
}

// Totals across many sessions. Returns the same shape as sessionMoney so
// the UI can render a season total with the same component it uses for a
// single night.
export function totalMoney(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const zero = { gross: 0, cost: 0, net: 0 };
  const acc = {
    poker: { ...zero }, highGame: { ...zero }, threeSixNine: { ...zero },
    gross: 0, cost: 0, net: 0,
  };

  for (const s of list) {
    const m = sessionMoney(s);
    if (!m) continue;
    for (const key of ['poker', 'highGame', 'threeSixNine']) {
      acc[key].gross += m[key].gross;
      acc[key].cost += m[key].cost;
      acc[key].net += m[key].net;
    }
    acc.gross += m.gross;
    acc.cost += m.cost;
    acc.net += m.net;
  }

  return acc;
}

// The bowler's own best single game for a session -- what a High Game Pot
// is decided on. The app can't know whether it WON (that depends on
// everyone else in the league), which is exactly why the payout stays a
// manual entry; this is just the number to compare against.
export function sessionHighGame(session) {
  const scores = (session?.scores || []).filter(s => typeof s === 'number');
  return scores.length ? Math.max(...scores) : null;
}

// ── Per-league buy-in rates ──────────────────────────────────────────────
//
// A league's buy-ins don't change from game to game or week to week: the
// quarter game costs a quarter every game, all season. Entering the same
// three numbers into nine boxes every week was pure repetition, and the
// most likely outcome of repetition is that one week they're wrong.
//
// Stored per league and applied to each game automatically. The SESSION
// still records per-game cost arrays -- that's what sessionMoney reads,
// and it's what makes a one-off week (skipped the dollar game in game 3)
// representable at all. This just fills them in.

// What a typical house charges. Defaults, not constants -- a house that
// runs a 50c game can change them, and changing them must not rewrite
// what past nights actually cost.
export const DEFAULT_BUY_INS = {
  pokerQuarter: 0.25,
  pokerDollar: 1,
  highGame: 0,
  threeSixNine: 0,
};

export function buyInsForLeague(buyIns, league) {
  const saved = (buyIns || {})[league] || {};
  return {
    pokerQuarter: saved.pokerQuarter ?? DEFAULT_BUY_INS.pokerQuarter,
    pokerDollar: saved.pokerDollar ?? DEFAULT_BUY_INS.pokerDollar,
    highGame: saved.highGame ?? DEFAULT_BUY_INS.highGame,
    threeSixNine: saved.threeSixNine ?? DEFAULT_BUY_INS.threeSixNine,
  };
}

// Cost arrays for a session, from the league's rates.
//
// Only charges games that were actually bowled -- `gamesBowled` is the
// count of non-null scores. Charging a buy-in for a game that doesn't
// exist would quietly overstate what the night cost.
export function costArraysFor(rates, gamesBowled, playing = null) {
  const n = Math.max(0, Math.min(3, gamesBowled || 0));

  // `playing` is which pots the bowler actually entered TONIGHT.
  //
  // Without it, saving a buy-in rate meant charging it every week
  // forever -- the app assumed you were in every pot every night, so a
  // week you sat out the dollar game silently cost you $3 you never
  // paid, and net winnings drifted from reality with nothing to show why.
  //
  // Null means "all of them", which keeps every existing caller and
  // every already-saved session behaving exactly as before.
  // Accepts either shape.
  //
  // `playing` is an object of {potKey: true} at every call site today,
  // but ["pokerQuarter"] is the obvious way to express the same thing --
  // and passing one silently charged NOTHING for every pot, because
  // array["pokerQuarter"] is undefined. Money quietly reading as zero is
  // the worst kind of wrong here: nobody notices until the pot is short.
  const inSet = Array.isArray(playing) ? new Set(playing) : null;
  const isIn = key => (playing == null ? true : (inSet ? inSet.has(key) : !!playing[key]));
  const per = (v, key) => [0, 1, 2].map(i => (i < n && isIn(key) ? (Number(v) || 0) : 0));

  return {
    pokerQuarterCost: per(rates.pokerQuarter, "pokerQuarter"),
    pokerDollarCost: per(rates.pokerDollar, "pokerDollar"),
    highGameCost: per(rates.highGame, "highGame"),
    threeSixNineCost: isIn("threeSixNine") ? (Number(rates.threeSixNine) || 0) : 0,
  };
}
