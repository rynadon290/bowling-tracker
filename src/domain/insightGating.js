// Deciding what's worth analysing.
//
// The constraint here isn't cost -- an analysis runs about a third of a
// cent. It's that a model given thin data will produce a confident story
// about noise, and a bowler will act on it.
//
// So statistics are filtered BEFORE they're sent, per statistic, on their
// own sample size. Asking the model to "be careful with small samples"
// doesn't work; it still finds patterns. If a statistic hasn't earned its
// sample, the model never sees it and cannot comment on it. Filtering also
// shrinks the payload, so the two goals point the same way.
//
// Thresholds come from the standard error of a proportion. At 95%
// confidence the half-width is 1.96 * sqrt(p(1-p)/n):
//
//   Overall strike rate, n=150   -> ±8.0%   usable for "your rate is X"
//   Spare conversion,    n=60    -> ±11.6%  usable, coarse
//   Two balls compared,  n=250   -> ±8.8%   the loosest bar worth having
//
// Ball comparison needs by far the most data, because comparing two
// proportions compounds both errors. With three balls in rotation, 250
// first balls each is roughly 75 games -- which is why ball insights
// legitimately arrive much later than overall ones.

// Below this there is nothing worth saying about anyone's game, and no
// request should be made at all.
export const MIN_GAMES_FOR_ANALYSIS = 10;

export const SAMPLE_THRESHOLDS = {
  // First balls needed before an overall strike/carry rate is reported.
  overallStrikeRate: 150,
  // Spare attempts needed before conversion is reported.
  spareConversion: 60,
  // Attempts at a specific leave (e.g. the 10 pin) before its rate is used.
  specificLeave: 25,
  // First balls with ONE ball before it may be compared with another.
  // Deliberately the highest bar -- see the note above.
  ballComparison: 250,
  // Games at a center before its average is treated as meaningful.
  centerAverage: 9,
  // Sessions before a trend over time is claimed.
  trendOverTime: 8,
  // Attempts at one drill target before its conversion is analysed. Same
  // bar as a specific leave -- a drill IS repeated attempts at one leave,
  // so there is no reason to hold it to a different standard.
  drillTarget: 25,
  // Games on one oil pattern before that pattern is analysed separately.
  // Lower than centerAverage: a pattern is a sharper variable than a
  // building, and a bowler sees far fewer games on any single one.
  patternGames: 6,
};

// Score-only thresholds live in domain/scoreInsights.js, next to the
// statistics they gate, because they count NIGHTS rather than shots and
// mixing the two scales in one table invited exactly the confusion this
// comment is preventing.
// Imported AND re-exported: `export { X } from "..."` forwards the name
// to consumers but does NOT bind it in this module's scope, so
// buildAnalysisPayload below could not see it.
import { SCORE_THRESHOLDS } from "./scoreInsights.js";
export { SCORE_THRESHOLDS };

export function meetsThreshold(kind, n) {
  const need = SAMPLE_THRESHOLDS[kind];
  if (need === undefined) return false;
  return (n ?? 0) >= need;
}

// How many more observations a statistic needs, for telling the bowler why
// something isn't available yet rather than silently omitting it.
export function shortfall(kind, n) {
  const need = SAMPLE_THRESHOLDS[kind];
  if (need === undefined) return null;
  const have = n ?? 0;
  return have >= need ? 0 : need - have;
}

// Whether an analysis should be run at all.
export function canAnalyze(gameCount) {
  return (gameCount ?? 0) >= MIN_GAMES_FOR_ANALYSIS;
}

export function gamesUntilAnalysis(gameCount) {
  return Math.max(0, MIN_GAMES_FOR_ANALYSIS - (gameCount ?? 0));
}

// Builds the payload sent for analysis: only statistics that cleared their
// own threshold, each carrying its sample size so the model can qualify
// language ("across 312 first balls") rather than overstating.
//
// `stats` is the pre-computed shape from the caller; nothing raw goes in.
export function buildAnalysisPayload(stats) {
  const included = {};
  const withheld = [];

  function consider(key, kind, value, n) {
    if (value === null || value === undefined) return;
    if (meetsThreshold(kind, n)) {
      included[key] = { value, sampleSize: n };
    } else {
      withheld.push({ key, need: SAMPLE_THRESHOLDS[kind], have: n ?? 0, shortBy: shortfall(kind, n) });
    }
  }

  consider("strikeRate", "overallStrikeRate", stats?.strikeRate, stats?.firstBalls);
  consider("spareConversion", "spareConversion", stats?.spareConversion, stats?.spareAttempts);
  consider("tenPinRate", "specificLeave", stats?.tenPinRate, stats?.tenPinAttempts);
  consider("splitRate", "specificLeave", stats?.splitRate, stats?.firstBalls);

  // Balls each clear the bar individually. One ball with enough shots is
  // still worth reporting on its own; comparison needs at least two.
  const balls = (stats?.balls || [])
    .filter(b => meetsThreshold("ballComparison", b.firstBalls))
    .map(b => ({
      name: b.name,
      strikeRate: b.strikeRate,
      sampleSize: b.firstBalls,
      ...(b.coverstock ? { coverstock: b.coverstock } : {}),
      ...(b.coreType ? { coreType: b.coreType } : {}),
    }));
  (stats?.balls || [])
    .filter(b => !meetsThreshold("ballComparison", b.firstBalls))
    .forEach(b => withheld.push({
      key: `ball:${b.name}`,
      need: SAMPLE_THRESHOLDS.ballComparison,
      have: b.firstBalls ?? 0,
      shortBy: shortfall("ballComparison", b.firstBalls),
    }));
  if (balls.length) included.balls = balls;

  const centers = (stats?.centers || [])
    .filter(c => meetsThreshold("centerAverage", c.games))
    .map(c => ({ name: c.name, average: c.average, sampleSize: c.games }));
  if (centers.length > 1) included.centers = centers;

  if (meetsThreshold("trendOverTime", stats?.sessionCount)) {
    included.recentAverages = stats.recentAverages;
  }

  // ── Drills ────────────────────────────────────────────────────────────
  // The practice group generates the most drill data and clears the shot
  // gates fastest, yet drills were never sent for analysis at all.
  const drills = (stats?.drills || [])
    .filter(d => meetsThreshold("drillTarget", d.attempts))
    .map(d => ({ target: d.label, conversion: d.rate, sampleSize: d.attempts }));
  (stats?.drills || [])
    .filter(d => !meetsThreshold("drillTarget", d.attempts))
    .forEach(d => withheld.push({
      key: `drill:${d.label}`,
      need: SAMPLE_THRESHOLDS.drillTarget,
      have: d.attempts ?? 0,
      shortBy: shortfall("drillTarget", d.attempts),
    }));
  if (drills.length) included.drills = drills;

  // ── Oil patterns ──────────────────────────────────────────────────────
  // Blending house-shot and sport-pattern games analyses two different
  // bowlers as one. Each pattern clears the bar on its own.
  const patterns = (stats?.patterns || [])
    .filter(p => meetsThreshold("patternGames", p.games))
    .map(p => ({ name: p.name, average: p.average, sampleSize: p.games }));
  if (patterns.length) included.patterns = patterns;

  // ── Score-only statistics ─────────────────────────────────────────────
  // These need no shots at all, so a bowler who tracks game scores only
  // still gets a real analysis instead of being told to come back later.
  const score = stats?.scoreStats;
  if (score) {
    if ((score.nights ?? 0) >= SCORE_THRESHOLDS.gamePosition && score.gamePosition) {
      included.gamePosition = {
        fade: score.gamePosition.fade,
        bestPosition: score.gamePosition.bestPosition,
        lastPosition: score.gamePosition.lastPosition,
        positions: score.gamePosition.positions,
        sampleSize: score.nights,
      };
    } else if (score.gamePosition) {
      withheld.push({ key: "gamePosition", need: SCORE_THRESHOLDS.gamePosition,
        have: score.nights ?? 0, shortBy: Math.max(0, SCORE_THRESHOLDS.gamePosition - (score.nights ?? 0)) });
    }
    if ((score.nights ?? 0) >= SCORE_THRESHOLDS.consistency && score.consistency) {
      included.consistency = { ...score.consistency, sampleSize: score.nights };
    } else if (score.consistency) {
      withheld.push({ key: "consistency", need: SCORE_THRESHOLDS.consistency,
        have: score.nights ?? 0, shortBy: Math.max(0, SCORE_THRESHOLDS.consistency - (score.nights ?? 0)) });
    }
    if ((score.nights ?? 0) >= SCORE_THRESHOLDS.formVsBook && score.formVsBook) {
      included.formVsBook = { ...score.formVsBook, sampleSize: score.nights };
    }
  }

  return {
    included,
    withheld,
    // Explicit so the model can be told what NOT to infer -- a comparison
    // is only licensed when two or more balls made the cut.
    canCompareBalls: balls.length >= 2,
    gameCount: stats?.gameCount ?? 0,
  };
}

// True when nothing cleared its threshold -- there's no point sending a
// request whose payload is empty.
export function payloadIsEmpty(payload) {
  return !payload || Object.keys(payload.included || {}).length === 0;
}

// ── What unlocks next ───────────────────────────────────────────────────
//
// 26 of 50 league bowlers hit "not enough data yet" on their first visit
// and 9 never came back. Nobody argued the bar was wrong once it was
// explained -- the complaint was being handed a dead end instead of a
// distance. This turns the wall into a progress bar.
//
// Sorted by how close each one is, so the first thing a bowler reads is
// the thing they are about to earn.

// Plain names for the statistics, since a bowler should never see a
// payload key.
const STAT_LABELS = {
  strikeRate: "Strike rate",
  spareConversion: "Spare conversion",
  tenPinRate: "Corner pin conversion",
  splitRate: "Split rate",
  recentAverages: "Trend over time",
  gamePosition: "Game-by-game fade",
  consistency: "Consistency",
  formVsBook: "Form vs book average",
};

// The unit each threshold counts, so "90 more" is never ambiguous.
const UNIT_LABELS = {
  overallStrikeRate: "first balls",
  spareConversion: "spare attempts",
  specificLeave: "attempts",
  ballComparison: "first balls",
  centerAverage: "games",
  trendOverTime: "nights",
  drillTarget: "attempts",
  patternGames: "games",
  gamePosition: "nights",
  consistency: "nights",
  formVsBook: "nights",
};

export function statLabel(key) {
  if (key.startsWith("ball:")) return `${key.slice(5)} (ball)`;
  if (key.startsWith("drill:")) return `${key.slice(6)} drill`;
  return STAT_LABELS[key] || key;
}

// Which threshold each statistic is measured against. Needed because a
// stat key and its threshold key are not the same thing -- "strikeRate"
// is gated by "overallStrikeRate" -- and getting this wrong renders
// "8 more more" to the bowler.
const STAT_KIND = {
  strikeRate: "overallStrikeRate",
  spareConversion: "spareConversion",
  tenPinRate: "specificLeave",
  splitRate: "specificLeave",
  recentAverages: "trendOverTime",
  gamePosition: "gamePosition",
  consistency: "consistency",
  formVsBook: "formVsBook",
};

export function kindForStat(key) {
  if (key.startsWith("ball:")) return "ballComparison";
  if (key.startsWith("drill:")) return "drillTarget";
  return STAT_KIND[key] || key;
}

export function unitLabel(kind) {
  return UNIT_LABELS[kind] || "more";
}

// Turns a payload's `withheld` list into an ordered "coming next" list.
// Takes the payload rather than raw stats so it reflects exactly what the
// analysis would have used.
export function upcomingUnlocks(payload, limit = 3) {
  const withheld = Array.isArray(payload?.withheld) ? payload.withheld : [];
  return withheld
    .filter(w => (w.shortBy ?? 0) > 0)
    .sort((a, b) => (a.shortBy ?? 0) - (b.shortBy ?? 0))
    .slice(0, limit)
    .map(w => ({
      key: w.key,
      label: statLabel(w.key),
      unit: unitLabel(kindForStat(w.key)),
      shortBy: w.shortBy,
      need: w.need,
      have: w.have,
    }));
}

// Signature of what is currently analysable, for spotting the moment a
// bowler crosses a threshold. Compared against the last value seen so a
// notification fires once, on the transition, rather than every render.
export function unlockSignature(payload) {
  return Object.keys(payload?.included || {}).sort().join(",");
}

// Which statistics are newly available since the signature last seen.
// Empty when nothing changed, which is the normal case.
export function newlyUnlocked(payload, previousSignature) {
  const now = Object.keys(payload?.included || {});
  if (previousSignature === null || previousSignature === undefined) return [];
  const before = new Set(String(previousSignature).split(",").filter(Boolean));
  return now.filter(k => !before.has(k)).map(statLabel);
}
