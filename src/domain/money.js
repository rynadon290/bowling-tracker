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
