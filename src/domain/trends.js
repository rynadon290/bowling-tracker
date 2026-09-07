// Trends over time.
//
// The Stats tab already has a single "Trend" card showing cumulative
// average. This module backs a dedicated tab that does the same job for
// several metrics and, more importantly, says whether a line is actually
// going anywhere.
//
// The hard part isn't drawing the line, it's not lying about it. A bowler
// looking at six nights of strike percentage will see a shape and read
// meaning into it, and per-night rates are extremely noisy: a night is
// roughly 20 first balls, so a "10-point drop" is well inside what pure
// chance produces when nothing has changed. Declaring "you're trending
// down" off that would send someone chasing a problem that doesn't exist,
// which is the same failure domain/insightGating.js exists to prevent.
//
// So this module separates two things:
//   - the SERIES, which is just the data and can always be plotted
//   - the DIRECTION, which is a claim, and is only made when the slope is
//     large enough relative to the scatter around it to be worth stating
//
// Everything here is per-session (one point per date bowled), because
// that's the unit a bowler actually thinks in.

import { SAMPLE_THRESHOLDS } from "./insightGating.js";

// Fewer points than this and a line is a connect-the-dots exercise, not a
// trend. Five sessions is roughly five weeks of league.
export const MIN_POINTS_FOR_DIRECTION = 5;

// The metrics a bowler can look at over time.
//
// `source` says where the numbers come from: "scores" reads sessions
// (game scores, always available), "shots" reads shot-by-shot detail
// (only present for bowlers tracking that way).
export const TREND_METRICS = [
  { id: "average", label: "Average", source: "scores", unit: "score",
    help: "Average score per night." },
  { id: "highGame", label: "Best Game", source: "scores", unit: "score",
    help: "Your best single game each night." },
  { id: "series", label: "Series Total", source: "scores", unit: "score",
    help: "Total pins each night." },
  { id: "strikeRate", label: "Strike %", source: "shots", unit: "percent",
    help: "Share of first balls that struck, per night." },
  { id: "spareRate", label: "Spare %", source: "shots", unit: "percent",
    help: "Non-split spare conversion, per night." },
  { id: "cleanFrameRate", label: "Clean Frame %", source: "shots", unit: "percent",
    help: "Frames closed with a strike or spare, per night." },
];

export const TREND_METRIC_IDS = TREND_METRICS.map(m => m.id);

export function trendMetric(id) {
  return TREND_METRICS.find(m => m.id === id) || null;
}

function bySession(rows, bowler, league) {
  return (rows || []).filter(r =>
    r && (bowler ? r.bowler === bowler : true) && (league ? r.league === league : true));
}

function groupByDate(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.date) continue;
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// Score-based series, one point per night.
export function scoreSeries(sessions, bowler, league, metricId) {
  const rows = bySession(sessions, bowler, league);
  const out = [];
  for (const [date, group] of groupByDate(rows)) {
    const scores = group.flatMap(s => Array.isArray(s.scores) ? s.scores : [])
      .filter(v => Number.isFinite(v));
    if (!scores.length) continue;
    let value = null;
    if (metricId === "average") {
      // Truncated, like every other average in this app.
      value = Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length);
    } else if (metricId === "highGame") {
      value = Math.max(...scores);
    } else if (metricId === "series") {
      value = scores.reduce((a, b) => a + b, 0);
    }
    if (value != null) out.push({ date, value, sample: scores.length });
  }
  return out;
}

const isFrameShot = s => !s.ballNum || s.ballNum === 1;

// Shot-based rate series, one point per night. `sample` travels with each
// point so the UI can be honest about how thin any given night is.
export function shotRateSeries(shots, bowler, league, metricId, isSplit = () => false) {
  const rows = bySession(shots, bowler, league);
  const out = [];
  for (const [date, group] of groupByDate(rows)) {
    const frames = group.filter(isFrameShot);
    let value = null, sample = 0;

    if (metricId === "strikeRate") {
      sample = frames.length;
      if (sample) value = Math.round((frames.filter(s => s.result === "Strike").length / sample) * 100);
    } else if (metricId === "cleanFrameRate") {
      sample = frames.length;
      if (sample) {
        value = Math.round((frames.filter(s => s.result === "Strike" || s.spareMade === "Yes").length / sample) * 100);
      }
    } else if (metricId === "spareRate") {
      const attempts = group.filter(s => s.result !== "Strike" && s.spareMade !== "" && s.spareMade != null && !isSplit(s));
      sample = attempts.length;
      if (sample) value = Math.round((attempts.filter(s => s.spareMade === "Yes").length / sample) * 100);
    }

    if (value != null) out.push({ date, value, sample });
  }
  return out;
}

export function seriesFor(metricId, { sessions, shots, bowler, league, isSplit }) {
  const metric = trendMetric(metricId);
  if (!metric) return [];
  return metric.source === "scores"
    ? scoreSeries(sessions, bowler, league, metricId)
    : shotRateSeries(shots, bowler, league, metricId, isSplit);
}

// Least-squares slope of value against position in the series.
//
// Position rather than calendar distance on purpose: bowlers think in
// nights, not days, and a six-week layoff shouldn't stretch the x-axis in
// a way that flattens a real change.
export function linearSlope(points) {
  const n = (points || []).length;
  if (n < 2) return null;
  const xs = points.map((_, i) => i);
  const ys = points.map(p => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

// Standard deviation of the residuals around the fitted line -- how much
// scatter the line is failing to explain.
function residualSpread(points, slope) {
  const n = points.length;
  const my = points.reduce((a, p) => a + p.value, 0) / n;
  const mx = (n - 1) / 2;
  const intercept = my - slope * mx;
  const residuals = points.map((p, i) => p.value - (slope * i + intercept));
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const variance = residuals.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

// Is this line actually going somewhere?
//
// Returns a direction only when there are enough points AND the total
// movement across the series is large relative to the night-to-night
// scatter. Otherwise the answer is "flat", which here honestly means "not
// distinguishable from noise" rather than "definitely unchanged".
export function trendDirection(points) {
  const n = (points || []).length;
  if (n < MIN_POINTS_FOR_DIRECTION) {
    return {
      direction: "unknown",
      confident: false,
      slope: null,
      pointsNeeded: MIN_POINTS_FOR_DIRECTION - n,
      total: null,
    };
  }
  const slope = linearSlope(points);
  if (slope == null) {
    return { direction: "flat", confident: false, slope: null, pointsNeeded: 0, total: 0 };
  }
  // Movement the line predicts across the whole series.
  const total = slope * (n - 1);
  const spread = residualSpread(points, slope);

  // The bar: the fitted line has to move further across the series than a
  // typical night deviates from it. Below that, the shape is scatter.
  const confident = spread === 0 ? Math.abs(total) > 0 : Math.abs(total) >= spread;

  return {
    direction: !confident ? "flat" : total > 0 ? "up" : "down",
    confident,
    slope,
    pointsNeeded: 0,
    total: Math.round(total * 10) / 10,
  };
}

// Per-night rates rest on small samples, so a series can be plottable but
// still too thin to reason about. Reports the median night's sample, which
// is more representative than the total.
export function seriesReliability(metricId, points) {
  const metric = trendMetric(metricId);
  if (!metric || metric.source !== "shots" || !points.length) {
    return { thin: false, medianSample: null };
  }
  const samples = points.map(p => p.sample).sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  // A night with fewer first balls than a specific-leave sample is worth
  // is too thin to read on its own.
  return { thin: median < SAMPLE_THRESHOLDS.specificLeave, medianSample: median };
}

// Plain-language summary. Deliberately hedged where the data is hedged.
export function describeTrend(metricId, points) {
  const metric = trendMetric(metricId);
  if (!metric) return "";
  const d = trendDirection(points);
  const unit = metric.unit === "percent" ? " points" : " pins";

  if (d.direction === "unknown") {
    return `${d.pointsNeeded} more night${d.pointsNeeded === 1 ? "" : "s"} needed before a direction means anything.`;
  }
  if (!d.confident) {
    return "No clear direction — the movement here is within normal night-to-night variation.";
  }
  const word = d.direction === "up" ? "up" : "down";
  return `Trending ${word} about ${Math.abs(d.total)}${unit} across this stretch.`;
}
