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
  return (Array.isArray(bowlers) ? bowlers : [])
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
  // Null ELEMENTS too. Array.isArray says the container is a list
  // and nothing about its contents, and one null row -- from a
  // partial import or a half-written record -- was enough to throw.
  lines = (Array.isArray(lines) ? lines : []).filter(x => x && typeof x === "object");
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
          : `${first.total}, won by ${margin}.`,
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
  const others = (Array.isArray(partners) ? partners : [])
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

// ── Drills ──────────────────────────────────────────────────────────────
//
// The practice recap above reads game scores. A drill session has none --
// it's made/missed attempts at one target -- so it needs its own summary,
// and a partner comparison that only ever compares like with like.
//
// The rule that matters here: two people are only comparable on a target
// they BOTH worked. Ranking someone's 10-pin percentage against another
// person's 4-pin percentage would be meaningless, and worse, it would look
// authoritative. So the comparison is grouped by target, and a target only
// one person did is reported as theirs alone rather than as a contest.

import { attempts, conversionRate, targetLabel, customPinKey } from "./drills.js";

// Default: nobody's hand is known. Real callers pass a per-bowler
// resolver (see leftHandedForBowler in BowlingTracker.jsx) because a
// comparison can legitimately involve two people of different hands --
// there is no single "the" handedness for a shared drillComparison call.
const noHandInfo = () => false;

// A conversion rate off two attempts is noise. This isn't a statistical
// threshold so much as a floor below which a percentage misleads more than
// it informs -- 1 for 2 reads as "50%" and means nothing.
export const MIN_DRILL_ATTEMPTS = 5;

function drillsFor(drills, bowler, date) {
  return (Array.isArray(drills) ? drills : []).filter(d =>
    d && d.bowler === bowler && (!date || d.date === date) && attempts(d) > 0);
}

// One bowler's drill work on a date, grouped by target. Multiple drills at
// the same target on one day are pooled -- they're the same practice, just
// logged in more than one sitting.
export function drillLines(drills, bowler, date, leftHanded = false) {
  const byTarget = new Map();
  for (const d of drillsFor(drills, bowler, date)) {
    // Custom targets defined by PINS key off the hand-agnostic pin set,
    // so a lefty's 2-4-7 groups with a righty's 3-6-10 -- the same
    // cross-hand matching the built-in combo targets already get. A
    // name-only custom target still keys off its name.
    const pinKey = customPinKey(d.customPins, leftHanded);
    const key = d.target === "custom"
      ? (pinKey ? `custompins:${pinKey}` : `custom:${(d.customTarget || "").trim().toLowerCase()}`)
      : d.target;
    if (!byTarget.has(key)) {
      // The stored target id is the canonical, hand-agnostic key used for
      // grouping and cross-bowler matching (see drillComparison) -- the
      // SAME abstract drill concept for both hands, same as "Weak 10"
      // stays "Weak 10" for a lefty. Only the label shown for it flips.
      byTarget.set(key, { key, target: d.target, label: targetLabel(d.target, d.customTarget, leftHanded, d.customPins), made: 0, missed: 0, balls: new Set() });
    }
    const line = byTarget.get(key);
    line.made += d.made || 0;
    line.missed += d.missed || 0;
    if (d.ball) line.balls.add(d.ball);
  }
  return [...byTarget.values()]
    .map(l => {
      const total = l.made + l.missed;
      return {
        key: l.key,
        target: l.target,
        label: l.label,
        made: l.made,
        missed: l.missed,
        attempts: total,
        rate: conversionRate({ made: l.made, missed: l.missed }),
        // Carried so the UI can hold back a percentage that rests on
        // almost nothing.
        thin: total < MIN_DRILL_ATTEMPTS,
        balls: [...l.balls],
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

export function drillRecap(drills, bowler, date, leftHanded = false) {
  const lines = drillLines(drills, bowler, date, leftHanded);
  if (!lines.length) return null;
  const totalMade = lines.reduce((a, l) => a + l.made, 0);
  const totalAttempts = lines.reduce((a, l) => a + l.attempts, 0);
  return {
    lines,
    targets: lines.length,
    made: totalMade,
    attempts: totalAttempts,
    // Overall rate across every target, which is a fair summary of the
    // session's work even though the individual targets differ in
    // difficulty.
    rate: totalAttempts ? Math.round((totalMade / totalAttempts) * 100) : null,
  };
}

// Head-to-head on drills, target by target.
//
// Returns null when nobody else drilled, and lists shared targets
// separately from ones only one person worked.
export function drillComparison(drills, bowler, partners, date, leftHandedFor = noHandInfo) {
  const mine = drillLines(drills, bowler, date, leftHandedFor(bowler));
  if (!mine.length) return null;

  const others = (Array.isArray(partners) ? partners : [])
    .filter(p => p && p !== bowler)
    .map(p => ({ bowler: p, lines: drillLines(drills, p, date, leftHandedFor(p)) }))
    .filter(x => x.lines.length);
  if (!others.length) return null;

  const myByKey = new Map(mine.map(l => [l.key, l]));
  const shared = [];
  for (const l of mine) {
    const theirs = others
      .map(o => ({ bowler: o.bowler, line: o.lines.find(x => x.key === l.key) }))
      .filter(x => x.line);
    if (!theirs.length) continue;
    shared.push({
      key: l.key,
      // The same stored target ("3-6-10") can read differently on each
      // side of a comparison -- a lefty and a righty pairing off on it
      // are working the SAME abstract drill, but her real pins are its
      // mirror. myLabel is always my own words for what I worked.
      myLabel: l.label,
      mine: l,
      others: theirs.map(t => ({
        bowler: t.bowler,
        // Their own label, in their own pins -- not mine reused for them.
        label: t.line.label,
        rate: t.line.rate,
        attempts: t.line.attempts,
        thin: t.line.thin,
        // Only stated when BOTH sides have enough attempts to mean
        // something; otherwise the gap is an artefact of small numbers.
        diff: l.thin || t.line.thin ? null : l.rate - t.line.rate,
      })),
    });
  }

  // Targets the partners worked that this bowler didn't -- shown as
  // information, never as a comparison.
  const theirsOnly = [];
  for (const o of others) {
    for (const l of o.lines) {
      if (myByKey.has(l.key)) continue;
      theirsOnly.push({ bowler: o.bowler, label: l.label, rate: l.rate, attempts: l.attempts, thin: l.thin });
    }
  }

  return { shared, theirsOnly, comparedOn: shared.length };
}

export function describeDrills(recap) {
  if (!recap) return "";
  const { made, attempts: n, targets, rate } = recap;
  const base = `${made} of ${n} across ${targets} target${targets === 1 ? "" : "s"}`;
  return n < MIN_DRILL_ATTEMPTS ? `${base}.` : `${base} — ${rate}%.`;
}
