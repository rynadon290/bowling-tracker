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
};

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
