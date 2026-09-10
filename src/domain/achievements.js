// Achievements worth telling someone about.
//
// Three kinds, and the distinction matters:
//
//   - HONOR SCORES are objective and universal. A 300 is a 300 whoever
//     bowls it, and it's the thing a bowler will remember for years.
//   - PERSONAL BESTS are relative. Beating your own high game is a real
//     moment even at 180, and for most bowlers it happens far more often
//     than an honor score ever will.
//   - PLACEMENT is what you did at a tournament -- won it, made the cut,
//     finished top five. Not computable from scores, so it's recorded.
//
// All three exist because "your average went up 3 pins" is not something
// anyone shares, and those are the moments people actually want to.

// USBC recognises 300 games and 800 series. 299 and 798 are superb and
// are NOT honor scores -- calling them one would be wrong in front of
// people who know the difference.
export const HONOR_GAME = 300;
export const HONOR_SERIES = 800;

// A perfect game, or an 800 series.
export function honorScores(games = [], seriesTotal = null) {
  const list = Array.isArray(games) ? games : [];
  const out = [];
  for (const g of list) {
    if (Number(g) === HONOR_GAME) {
      out.push({
        kind: "honor",
        id: "perfect-game",
        emoji: "\u{1F3AF}",
        title: "Perfect game",
        detail: "300. Nothing left to take off it.",
        value: HONOR_GAME,
      });
    }
  }
  const total = seriesTotal ?? (list.some(g => g == null) ? null : list.reduce((a, b) => a + Number(b), 0));
  if (total != null && total >= HONOR_SERIES) {
    out.push({
      kind: "honor",
      id: "honor-series",
      emoji: "\u{1F525}",
      title: "Honor series",
      detail: `${total}. An 800 series is an 800 series.`,
      value: total,
    });
  }
  return out;
}

// Beat your own best. `previous` is what to beat -- null means there's
// nothing on record yet, which is NOT an achievement: everyone's first
// night would trigger one and the moment would mean nothing.
export function personalBests(games = [], seriesTotal = null, previous = {}) {
  previous = (previous && typeof previous === "object") ? previous : {};
  const list = Array.isArray(games) ? games : [];
  const out = [];
  const best = list.filter(g => g != null).map(Number);
  const high = best.length ? Math.max(...best) : null;
  const prevGame = Number(previous.highGame) || null;
  const prevSeries = Number(previous.highSeries) || null;

  if (high != null && prevGame && high > prevGame) {
    out.push({
      kind: "personalBest",
      id: "high-game",
      emoji: "\u2B50",
      title: "New personal best game",
      detail: `${high}, beating your ${prevGame} by ${high - prevGame}.`,
      value: high,
      previous: prevGame,
    });
  }

  const total = seriesTotal ?? (best.length === list.length && list.length
    ? best.reduce((a, b) => a + b, 0) : null);
  if (total != null && prevSeries && total > prevSeries) {
    out.push({
      kind: "personalBest",
      id: "high-series",
      emoji: "\u2B50",
      title: "New personal best series",
      detail: `${total}, beating your ${prevSeries} by ${total - prevSeries}.`,
      value: total,
      previous: prevSeries,
    });
  }
  return out;
}

// What a bowler did at a tournament. Recorded, not computed -- the app
// can't know you won from your scores alone.
export const PLACEMENTS = [
  { id: "won", label: "Won it", emoji: "\u{1F3C6}" },
  { id: "runnerUp", label: "Runner-up", emoji: "\u{1F948}" },
  { id: "topFive", label: "Top five", emoji: "\u{1F3C5}" },
  { id: "cashed", label: "Cashed", emoji: "\u{1F4B0}" },
  { id: "madeCut", label: "Made the cut", emoji: "\u2705" },
  { id: "none", label: "Didn't cash", emoji: "" },
];

export function placementFor(id) {
  return PLACEMENTS.find(p => p.id === id) || null;
}

export function placementAchievement(placementId, tournamentName = "") {
  const p = placementFor(placementId);
  if (!p || p.id === "none") return null;
  return {
    kind: "placement",
    id: `placement-${p.id}`,
    emoji: p.emoji,
    title: p.label,
    detail: tournamentName ? `${tournamentName}.` : "",
    value: p.id,
  };
}

// Everything worth celebrating from one night or event, best first.
//
// Honor scores lead, then placement, then personal bests -- that's the
// order a bowler would tell someone about them in.
export function achievementsFor(arg) {
  const {
    games = [], seriesTotal = null, previous = {},
    placementId = null, tournamentName = "",
  } = (arg && typeof arg === "object") ? arg : {};
  const placement = placementAchievement(placementId, tournamentName);
  return [
    ...honorScores(games, seriesTotal),
    ...(placement ? [placement] : []),
    ...personalBests(games, seriesTotal, previous),
  ];
}

// A one-line summary for a share card.
export function achievementHeadline(achievements = []) {
  if (!Array.isArray(achievements) || !achievements.length) return "";
  const a = achievements[0];
  return `${a.emoji} ${a.title}`.trim();
}
