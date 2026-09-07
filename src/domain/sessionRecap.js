// End-of-session recaps for the two environments that don't have a
// league book behind them.
//
// "Just Bowling" is friends and kids. Nobody there wants a strike
// percentage; they want to know who won and by how much, with enough
// personality that reading it is part of the night. Practice is the
// opposite mood -- one person working on something, who wants to know
// whether tonight was better than usual and, if a partner came along, how
// they stacked up.
//
// Both read game scores only. Casual forces scores-only tracking, and a
// practice partner is a local guest whose shots aren't logged in detail.
// So everything here works from the same modest input, which is also why
// it can't and shouldn't try to say anything about ball reaction.
//
// PRIVACY: a guest is someone who typed their name into a friend's phone
// and agreed to nothing. Their names never leave the device (see
// guestsRef in BowlingTracker.jsx) and nothing in this module changes
// that -- a recap is rendered and discarded, never persisted or synced.

import { getManualScore, seriesTotal } from "./manualScores.js";

// How many games a casual or practice night is assumed to run. Both
// environments let a bowler stop early; missing games are simply absent
// rather than counted as zero.
const MAX_GAMES = 3;

function scoresFor(manualScores, bowler, league, date) {
  const out = [];
  for (let g = 1; g <= MAX_GAMES; g++) {
    const raw = getManualScore(manualScores, bowler, league, date, g);
    const n = raw === null || raw === "" ? null : Number(raw);
    if (n !== null && Number.isFinite(n) && n >= 0 && n <= 300) out.push(n);
  }
  return out;
}

// One bowler's night.
export function bowlerLine(manualScores, bowler, league, date) {
  const scores = scoresFor(manualScores, bowler, league, date);
  if (!scores.length) return null;
  const total = seriesTotal(scores);
  return {
    bowler,
    scores,
    games: scores.length,
    total,
    // Truncated, like every average in this app.
    average: Math.floor(total / scores.length),
    high: Math.max(...scores),
    low: Math.min(...scores),
    // Biggest jump between consecutive games, signed. Says whether someone
    // warmed up or fell apart, which is most of the story on a fun night.
    swing: scores.length > 1
      ? scores.slice(1).reduce((best, v, i) => {
          const d = v - scores[i];
          return Math.abs(d) > Math.abs(best) ? d : best;
        }, 0)
      : null,
  };
}

// Everyone who bowled, best series first.
export function sessionLines(manualScores, bowlers, league, date) {
  return (bowlers || [])
    .map(b => bowlerLine(manualScores, b, league, date))
    .filter(Boolean)
    .sort((a, b) => b.total - a.total);
}

// ── Fun awards, for the casual recap ────────────────────────────────────
//
// Awards are handed out only when the data actually supports them. A
// "biggest comeback" for someone who improved by two pins is a joke that
// doesn't land, and a group of one person shouldn't be told they won.

// A swing under this is noise, not a comeback or a collapse.
const NOTABLE_SWING = 25;

export function awards(lines) {
  if (!lines || lines.length === 0) return [];
  const out = [];
  const multi = lines.length > 1;

  if (multi) {
    const [first, second] = lines;
    const margin = first.total - second.total;
    out.push({
      id: "winner",
      emoji: "👑",
      title: "Winner",
      bowler: first.bowler,
      detail: margin === 0
        ? `Tied at ${first.total} — nobody's settling this tonight.`
        : margin <= 10
          ? `${first.total}, by just ${margin}. That was close.`
          : `${first.total}, winning by ${margin}.`,
    });
  }

  const bestGame = [...lines].sort((a, b) => b.high - a.high)[0];
  if (bestGame) {
    out.push({
      id: "bestGame",
      emoji: "🔥",
      title: "Best Single Game",
      bowler: bestGame.bowler,
      detail: `${bestGame.high}${bestGame.high >= 200 ? " — that's a real game." : ""}`,
    });
  }

  const comeback = [...lines]
    .filter(l => l.swing != null && l.swing >= NOTABLE_SWING)
    .sort((a, b) => b.swing - a.swing)[0];
  if (comeback) {
    out.push({
      id: "comeback",
      emoji: "📈",
      title: "Biggest Comeback",
      bowler: comeback.bowler,
      detail: `Jumped ${comeback.swing} pins between games.`,
    });
  }

  const collapse = [...lines]
    .filter(l => l.swing != null && l.swing <= -NOTABLE_SWING)
    .sort((a, b) => a.swing - b.swing)[0];
  if (collapse) {
    out.push({
      id: "collapse",
      emoji: "📉",
      title: "Ran Out Of Steam",
      bowler: collapse.bowler,
      detail: `Dropped ${Math.abs(collapse.swing)} pins between games.`,
    });
  }

  // Most consistent only means something with 3+ games and an actual
  // spread to compare against.
  const consistent = lines.filter(l => l.games >= 3);
  if (multi && consistent.length > 1) {
    const spread = l => l.high - l.low;
    const steadiest = [...consistent].sort((a, b) => spread(a) - spread(b))[0];
    if (spread(steadiest) <= 20) {
      out.push({
        id: "consistent",
        emoji: "🎯",
        title: "Most Consistent",
        bowler: steadiest.bowler,
        detail: `Every game within ${spread(steadiest)} pins.`,
      });
    }
  }

  return out;
}

// The casual recap.
export function casualRecap(manualScores, bowlers, league, date) {
  const lines = sessionLines(manualScores, bowlers, league, date);
  if (!lines.length) return null;
  const totalPins = lines.reduce((a, l) => a + l.total, 0);
  return {
    lines,
    awards: awards(lines),
    bowlerCount: lines.length,
    totalPins,
    // Only meaningful with more than one bowler.
    margin: lines.length > 1 ? lines[0].total - lines[lines.length - 1].total : null,
  };
}

// ── Practice ────────────────────────────────────────────────────────────
//
// Practice compares tonight against this bowler's own history rather than
// against whoever came along -- the point of practice is your own trend.
// A partner comparison is added on top when there is one, but it never
// replaces the self-comparison.

export function practiceRecap(manualScores, bowler, league, date, priorAverage = null) {
  const line = bowlerLine(manualScores, bowler, league, date);
  if (!line) return null;

  // Comparison against the bowler's established average, when there is
  // one. Null rather than zero when there's no history -- "0 above your
  // average" would read as a flat night rather than an unknown one.
  const vsAverage = priorAverage != null && Number.isFinite(priorAverage)
    ? line.average - Math.floor(priorAverage)
    : null;

  return {
    ...line,
    priorAverage: priorAverage != null && Number.isFinite(priorAverage) ? Math.floor(priorAverage) : null,
    vsAverage,
    spread: line.high - line.low,
  };
}

// Head-to-head when someone practised alongside you.
export function practiceComparison(manualScores, bowler, partners, league, date) {
  const mine = bowlerLine(manualScores, bowler, league, date);
  if (!mine) return null;
  const others = (partners || [])
    .filter(p => p && p !== bowler)
    .map(p => bowlerLine(manualScores, p, league, date))
    .filter(Boolean);
  if (!others.length) return null;

  return {
    mine,
    others: others.sort((a, b) => b.total - a.total),
    // Compared on average rather than total: a partner who bowled two
    // games to your three would lose on total for no reason that reflects
    // how either of you threw it.
    comparisons: others.map(o => ({
      bowler: o.bowler,
      theirAverage: o.average,
      diff: mine.average - o.average,
      theirGames: o.games,
      sameGameCount: o.games === mine.games,
    })),
  };
}

// A sentence for the practice recap. Honest about a flat night rather
// than manufacturing encouragement.
export function describePractice(recap) {
  if (!recap) return "";
  const { average, games, vsAverage, spread } = recap;
  const base = `${average} average over ${games} game${games === 1 ? "" : "s"}`;
  if (vsAverage == null) return `${base}.`;
  if (vsAverage > 0) return `${base} — ${vsAverage} above your average.`;
  if (vsAverage < 0) return `${base} — ${Math.abs(vsAverage)} below your average.`;
  return `${base} — right on your average.`;
}
