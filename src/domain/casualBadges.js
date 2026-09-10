// Badges for a casual bowler, and the leaderboard they show up on.
//
// A casual bowler has one number per game and nothing else — no frames,
// no spare data, no ball. So every badge here has to be earnable from
// game totals alone, across a group, over time.
//
// The design rule: a badge should be something you'd actually say out
// loud at the lanes. "Beat everyone in all three games" is a thing
// people say. "62nd percentile consistency" is not.
//
// Deliberately mixed in difficulty. If they're all hard, most people
// never earn one and the feature is dead weight for exactly the group
// least invested in the app. Several are meant to be easy, a couple are
// jokes, and a few take real bowling.

export const CASUAL_BADGES = [
  // ── Showing up ──────────────────────────────────────────────────────
  {
    id: "first-night",
    emoji: "\u{1F3B3}",
    name: "First night",
    blurb: "Bowled a night with the group.",
    earn: ({ nights }) => nights >= 1,
  },
  {
    id: "regular",
    emoji: "\u{1F4C5}",
    name: "Regular",
    blurb: "Five nights in.",
    earn: ({ nights }) => nights >= 5,
  },
  {
    id: "fixture",
    emoji: "\u{1F3E0}",
    name: "Fixture",
    blurb: "Fifteen nights. You live here now.",
    earn: ({ nights }) => nights >= 15,
  },
  {
    id: "marathon",
    emoji: "\u{1F4AA}",
    name: "Marathon",
    blurb: "Six games in one night.",
    earn: ({ mostGamesInANight }) => mostGamesInANight >= 6,
  },

  // ── Scores anyone can reach ─────────────────────────────────────────
  {
    id: "triple-figures",
    emoji: "\u0031\u20E3",
    name: "Triple figures",
    blurb: "Broke 100.",
    earn: ({ highGame }) => highGame >= 100,
  },
  {
    id: "one-fifty",
    emoji: "\u{1F4C8}",
    name: "One fifty",
    blurb: "Broke 150.",
    earn: ({ highGame }) => highGame >= 150,
  },
  {
    id: "two-hundred",
    emoji: "\u{1F525}",
    name: "Two hundred",
    blurb: "Broke 200. That's a real game.",
    earn: ({ highGame }) => highGame >= 200,
  },
  {
    id: "five-hundred-series",
    emoji: "\u{1F3AF}",
    name: "Five hundred",
    blurb: "A 500 series across three games.",
    earn: ({ bestThreeGameSeries }) => bestThreeGameSeries >= 500,
  },

  // ── Beating the people you came with ────────────────────────────────
  {
    id: "night-winner",
    emoji: "\u{1F451}",
    name: "Night winner",
    blurb: "Won a night outright.",
    earn: ({ nightsWon }) => nightsWon >= 1,
  },
  {
    id: "repeat-champion",
    emoji: "\u{1F3C6}",
    name: "Repeat champion",
    blurb: "Won three nights.",
    earn: ({ nightsWon }) => nightsWon >= 3,
  },
  {
    id: "clean-sweep",
    emoji: "\u{1F9F9}",
    name: "Clean sweep",
    blurb: "Won every game in a night.",
    earn: ({ sweptANight }) => !!sweptANight,
  },
  {
    id: "giant-killer",
    emoji: "\u{1F5E1}\uFE0F",
    name: "Giant killer",
    blurb: "Beat someone averaging 30 more than you.",
    earn: ({ beatBetterBowler }) => !!beatBetterBowler,
  },

  // ── Shape of your night ─────────────────────────────────────────────
  {
    id: "comeback",
    emoji: "\u{1F680}",
    name: "Comeback",
    blurb: "Improved 40 pins between games in a night.",
    earn: ({ biggestJump }) => biggestJump >= 40,
  },
  {
    id: "consistent",
    emoji: "\u{1F4CF}",
    name: "Metronome",
    blurb: "Three games within 10 pins of each other.",
    earn: ({ tightestSpread }) => tightestSpread != null && tightestSpread <= 10,
  },
  {
    id: "personal-best",
    emoji: "\u2B50",
    name: "New best",
    blurb: "Beat your own high game.",
    earn: ({ beatOwnBest }) => !!beatOwnBest,
  },
  {
    id: "climbing",
    emoji: "\u{1F4CA}",
    name: "Climbing",
    blurb: "Your average went up over five nights.",
    earn: ({ averageRising }) => !!averageRising,
  },

  // ── The ones people actually laugh about ────────────────────────────
  {
    id: "gutter-night",
    emoji: "\u{1F573}\uFE0F",
    name: "Rough night",
    blurb: "Everyone has one. Under 70.",
    earn: ({ lowGame }) => lowGame != null && lowGame < 70,
  },
  {
    id: "photo-finish",
    emoji: "\u{1F4F8}",
    name: "Photo finish",
    blurb: "Won or lost a night by a single pin.",
    earn: ({ onePinMargin }) => !!onePinMargin,
  },
  {
    id: "wooden-spoon",
    emoji: "\u{1F944}",
    name: "Wooden spoon",
    blurb: "Finished last. Someone has to.",
    earn: ({ nightsLast }) => nightsLast >= 1,
  },
  {
    id: "double-century",
    emoji: "\u{1F31F}",
    name: "Back to back",
    blurb: "Two 150+ games in a row.",
    earn: ({ backToBack150 }) => !!backToBack150,
  },
  {
    id: "the-spread",
    emoji: "\u{1F3A2}",
    name: "Rollercoaster",
    blurb: "100 pins between your best and worst game in one night.",
    earn: ({ widestSpread }) => widestSpread >= 100,
  },
  {
    id: "host",
    emoji: "\u{1F4F1}",
    name: "Scorekeeper",
    blurb: "Kept score for four or more people.",
    earn: ({ mostPeopleInANight }) => mostPeopleInANight >= 4,
  },
];

// Which badges a bowler has earned, from their stats.
export function badgesFor(stats) {
  if (!stats) return [];
  return CASUAL_BADGES.filter(b => {
    try { return !!b.earn(stats); } catch { return false; }
  });
}

// ── Building the stats each badge needs ─────────────────────────────────
//
// One pass over a bowler's casual nights. Everything a badge asks for is
// derived here so the badge definitions stay declarative.

export function casualStatsFor(bowler, nights = []) {
  const list = Array.isArray(nights) ? nights : [];
  const mine = list
    .map(n => ({ ...n, scores: (n.scoresByBowler?.[bowler] || []).filter(v => v != null).map(Number) }))
    .filter(n => n.scores.length);

  if (!mine.length) return null;

  const allScores = mine.flatMap(n => n.scores);
  const highGame = Math.max(...allScores);
  const lowGame = Math.min(...allScores);
  const games = allScores.length;
  const average = Math.round(allScores.reduce((a, b) => a + b, 0) / games);

  let nightsWon = 0, nightsLast = 0, sweptANight = false;
  let biggestJump = 0, widestSpread = 0, tightestSpread = null;
  let backToBack150 = false, onePinMargin = false, beatBetterBowler = false;
  let mostGamesInANight = 0, mostPeopleInANight = 0, bestThreeGameSeries = 0;

  for (const night of mine) {
    const s = night.scores;
    mostGamesInANight = Math.max(mostGamesInANight, s.length);

    const totals = Object.entries(night.scoresByBowler || {})
      .map(([who, vals]) => {
        const nums = (vals || []).filter(v => v != null).map(Number);
        return { who, total: nums.reduce((a, b) => a + b, 0), games: nums.length, avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0 };
      })
      .filter(t => t.games);
    mostPeopleInANight = Math.max(mostPeopleInANight, totals.length);

    // Ranked by AVERAGE, not total: someone who bowled four games
    // shouldn't beat someone who bowled three just by playing longer.
    const ranked = [...totals].sort((a, b) => b.avg - a.avg);
    if (ranked.length > 1) {
      if (ranked[0].who === bowler) nightsWon++;
      if (ranked[ranked.length - 1].who === bowler) nightsLast++;
      const margin = Math.abs(ranked[0].avg - ranked[1].avg);
      if (margin > 0 && margin <= 1) onePinMargin = true;

      // Beat someone whose long-run average is well above yours.
      const me = totals.find(t => t.who === bowler);
      for (const other of totals) {
        if (other.who === bowler) continue;
        if (me && me.avg > other.avg && other.avg - average >= 30) beatBetterBowler = true;
      }

      // Won every single game, head to head.
      const gameCount = Math.max(...totals.map(t => t.games));
      let swept = totals.length > 1;
      for (let g = 0; g < gameCount; g++) {
        const mineG = (night.scoresByBowler[bowler] || [])[g];
        if (mineG == null) { swept = false; break; }
        for (const other of Object.keys(night.scoresByBowler || {})) {
          if (other === bowler) continue;
          const theirs = (night.scoresByBowler[other] || [])[g];
          if (theirs != null && Number(theirs) >= Number(mineG)) { swept = false; break; }
        }
        if (!swept) break;
      }
      if (swept) sweptANight = true;
    }

    for (let i = 1; i < s.length; i++) {
      biggestJump = Math.max(biggestJump, s[i] - s[i - 1]);
      if (s[i] >= 150 && s[i - 1] >= 150) backToBack150 = true;
    }
    if (s.length > 1) {
      const spread = Math.max(...s) - Math.min(...s);
      widestSpread = Math.max(widestSpread, spread);
      if (s.length >= 3) {
        tightestSpread = tightestSpread == null ? spread : Math.min(tightestSpread, spread);
        for (let i = 0; i + 2 < s.length; i++) {
          bestThreeGameSeries = Math.max(bestThreeGameSeries, s[i] + s[i + 1] + s[i + 2]);
        }
      }
    }
    if (s.length >= 3) bestThreeGameSeries = Math.max(bestThreeGameSeries, s.slice(0, 3).reduce((a, b) => a + b, 0));
  }

  // Beat your own best: a later night's high beats every earlier night's.
  let beatOwnBest = false, runningHigh = null;
  for (const night of mine) {
    const nightHigh = Math.max(...night.scores);
    if (runningHigh != null && nightHigh > runningHigh) beatOwnBest = true;
    runningHigh = runningHigh == null ? nightHigh : Math.max(runningHigh, nightHigh);
  }

  // Average trending up across the last five nights.
  let averageRising = false;
  if (mine.length >= 5) {
    const avgOf = n => n.scores.reduce((a, b) => a + b, 0) / n.scores.length;
    const last5 = mine.slice(-5).map(avgOf);
    averageRising = last5[last5.length - 1] > last5[0];
  }

  return {
    bowler, games, average, highGame, lowGame,
    nights: mine.length,
    nightsWon, nightsLast, sweptANight,
    biggestJump, widestSpread, tightestSpread,
    backToBack150, onePinMargin, beatBetterBowler, beatOwnBest, averageRising,
    mostGamesInANight, mostPeopleInANight, bestThreeGameSeries,
  };
}

// The leaderboard: everyone who's ever been on a scoresheet.
//
// Ranked by average rather than total, because people bowl different
// numbers of games — the games count is shown so a 3-game average isn't
// mistaken for a 30-game one.
export function casualLeaderboard(nights = []) {
  const list = Array.isArray(nights) ? nights : [];
  const people = new Set();
  for (const n of list) for (const who of Object.keys(n.scoresByBowler || {})) people.add(who);

  return [...people]
    .map(who => {
      const stats = casualStatsFor(who, list);
      return stats ? { ...stats, badges: badgesFor(stats) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.average - a.average || b.games - a.games || a.bowler.localeCompare(b.bowler));
}
