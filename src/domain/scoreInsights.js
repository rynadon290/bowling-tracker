// Insights from game scores alone.
//
// Everything Insights analysed was shot-derived, which quietly meant the
// tab was dead for anyone who tracks scores only -- 12/50 league bowlers
// and most of the casual group. They were not told this; they were shown
// "no single statistic has enough data", which reads as "not yet" when it
// actually meant "never".
//
// Game scores support real analysis. None of this needs a single logged
// shot:
//
//   - Game-position fade. A bowler who averages 195/190/165 is losing it
//     in the third game, and that is one of the most actionable things
//     you can tell someone. Needs only scores[].
//   - Consistency. 180/180/180 and 140/230/170 are the same average and
//     completely different bowlers. Spread is the thing a coach reacts to.
//   - Direction over time, which trends.js already computes.
//   - Form against the bowler's own book average.
//
// Same discipline as the shot-based gates: each figure carries its own
// sample size and is withheld until it has earned it. A "fade" measured
// over three nights is a story about noise.

// Sessions needed before each claim. Lower than the shot thresholds
// because a session average is already an aggregate of three games --
// the noise is pre-smoothed in a way a single first ball is not.
export const SCORE_THRESHOLDS = {
  // Nights before per-game-position averages are compared. Each night
  // contributes one observation per position, so 8 nights is 8 games in
  // each slot.
  gamePosition: 8,
  // Nights before spread/consistency is characterised.
  consistency: 6,
  // Nights before current form is set against book average.
  formVsBook: 6,
};

function scoresOf(session) {
  return Array.isArray(session?.scores) ? session.scores.filter(v => Number.isFinite(v)) : [];
}

function mean(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// Population standard deviation. Population rather than sample because
// these are the games actually bowled, not a sample drawn from a larger
// set the bowler cares about.
function stdDev(values) {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

// Average by position in the series -- game 1 vs 2 vs 3.
//
// Deliberately positional, not chronological across the night: a bowler
// who bowls a 4-game set has four positions, and blending position 4 into
// position 1 would hide exactly the fade this exists to find.
export function gamePositionAverages(sessions, bowler) {
  const mine = (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && (bowler ? s.bowler === bowler : true));
  const byPosition = [];
  for (const s of mine) {
    scoresOf(s).forEach((score, i) => {
      (byPosition[i] = byPosition[i] || []).push(score);
    });
  }
  return byPosition.map((scores, i) => ({
    position: i + 1,
    average: mean(scores),
    games: scores.length,
  })).filter(p => p.games > 0);
}

// The drop (or climb) from the best position to the last one. Positive
// means they finish weaker than their best game slot.
export function positionFade(sessions, bowler) {
  const positions = gamePositionAverages(sessions, bowler);
  if (positions.length < 2) return null;
  const last = positions[positions.length - 1];
  const best = positions.reduce((a, b) => (b.average > a.average ? b : a));
  if (best.position === last.position) return { fade: 0, bestPosition: best.position, lastPosition: last.position, positions };
  return {
    fade: Math.round((best.average - last.average) * 10) / 10,
    bestPosition: best.position,
    lastPosition: last.position,
    positions,
  };
}

// Spread within a night and across nights. Two different kinds of
// inconsistency: the bowler who is erratic game to game, and the bowler
// who is steady on the night but unpredictable week to week.
export function consistency(sessions, bowler) {
  const mine = (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && (bowler ? s.bowler === bowler : true) && scoresOf(s).length >= 2);
  if (!mine.length) return null;

  const withinNight = mine
    .map(s => stdDev(scoresOf(s)))
    .filter(v => v !== null);
  const nightAverages = mine.map(s => mean(scoresOf(s))).filter(v => v !== null);

  return {
    nights: mine.length,
    // Typical game-to-game swing inside a single night.
    withinNight: mean(withinNight),
    // Night-to-night swing of the nightly average.
    betweenNights: stdDev(nightAverages),
    highGame: Math.max(...mine.flatMap(scoresOf)),
    lowGame: Math.min(...mine.flatMap(scoresOf)),
  };
}

// Current form against the bowler's own frozen book average -- the
// comparison they actually care about, and one the app already has the
// number for.
export function formVsBook(sessions, bowler, bookAverage) {
  const book = Number(bookAverage);
  if (!Number.isFinite(book) || book <= 0) return null;
  const mine = (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && (bowler ? s.bowler === bowler : true));
  const recent = mine.slice(-8);
  const games = recent.flatMap(scoresOf);
  if (!games.length) return null;
  const current = mean(games);
  return {
    book: Math.floor(book),
    current,
    diff: Math.round((current - book) * 10) / 10,
    nights: recent.length,
    games: games.length,
  };
}

// Everything the score-only path can offer, with sample sizes attached so
// the gating layer can withhold what has not earned its place.
export function scoreStats(sessions, bowler, bookAverage) {
  const mine = (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && (bowler ? s.bowler === bowler : true));
  const nights = mine.length;

  const fade = positionFade(sessions, bowler);
  const cons = consistency(sessions, bowler);
  const form = formVsBook(sessions, bowler, bookAverage);

  return {
    nights,
    gamePosition: fade ? { ...fade, sampleSize: nights } : null,
    consistency: cons ? { ...cons, sampleSize: cons.nights } : null,
    formVsBook: form ? { ...form, sampleSize: form.nights } : null,
  };
}
