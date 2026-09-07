// Personal goals per statistic.
//
// A bowler picks a target for a stat they care about ("average 190",
// "convert 75% of single-pin spares") and gets a progress indicator
// against it.
//
// The important constraint, inherited from domain/insightGating.js: a
// goal must not report progress off a sample too thin to mean anything.
// Telling someone they're "at 62%, 3% off target" after eleven spare
// attempts is worse than telling them nothing, because they'll act on it
// -- change a ball, change a line -- on what is statistically noise. So
// every goal carries the same sample threshold the corresponding stat
// already uses elsewhere, and below it the goal shows how much more data
// it needs instead of a number.
//
// Score-based goals (average, high game, high series) are exempt from
// that: a high game of 268 is a fact, not an estimate, and an average is
// already the thing being averaged rather than a proportion inferred from
// a sample.

import { SAMPLE_THRESHOLDS } from "./insightGating.js";

// Goal kinds. `unit` decides how a target is entered and displayed;
// `sampleKey` names what's being counted for the gate (null = no gate).
//
// Deliberately a small list. Every stats card could technically take a
// goal, but most of them are diagnostic breakdowns ("miss distribution",
// "ball change triggers") where a single target number means nothing.
// These are the ones a bowler actually says out loud as a goal.
export const GOAL_TYPES = [
  {
    id: "average",
    label: "Average",
    unit: "score",
    min: 50, max: 300,
    sampleKey: null,
    minSample: 0,
    sampleNoun: "games",
    help: "Your running average across all games in the current view.",
  },
  {
    id: "highGame",
    label: "High Game",
    unit: "score",
    min: 50, max: 300,
    sampleKey: null,
    minSample: 0,
    sampleNoun: "games",
    help: "Your best single game.",
  },
  {
    id: "highSeries",
    label: "High Series",
    unit: "score",
    min: 100, max: 900,
    sampleKey: null,
    minSample: 0,
    sampleNoun: "series",
    help: "Your best series total.",
  },
  {
    id: "strikeRate",
    label: "Strike %",
    unit: "percent",
    min: 1, max: 100,
    sampleKey: "overallStrikeRate",
    sampleNoun: "first balls",
    help: "Share of first balls that strike.",
  },
  {
    id: "spareRate",
    label: "Spare %",
    unit: "percent",
    min: 1, max: 100,
    sampleKey: "spareConversion",
    sampleNoun: "spare attempts",
    help: "Non-split spare conversion.",
  },
  {
    id: "singlePinSpareRate",
    label: "Single Pin Spare %",
    unit: "percent",
    min: 1, max: 100,
    sampleKey: "specificLeave",
    sampleNoun: "single-pin attempts",
    help: "Conversion on leaves of exactly one pin.",
  },
  {
    id: "tenPinSpareRate",
    // The id stays "tenPinSpareRate" for every bowler on purpose: it's the
    // storage key, and renaming it for lefties would orphan any goal they
    // had already saved. Only the label and the help text flip -- same
    // approach constants.js takes with "Weak 10" / "Weak 7".
    label: "10 Pin Spare %",
    cornerPin: true,
    unit: "percent",
    min: 1, max: 100,
    // Same threshold insightGating already uses for tenPinRate -- a
    // specific leave, not an overall rate.
    sampleKey: "specificLeave",
    sampleNoun: "10 pin attempts",
    help: "Conversion on a lone corner pin (including weak and ringing ones).",
  },
  {
    id: "cleanFrameRate",
    label: "Clean Frame %",
    unit: "percent",
    min: 1, max: 100,
    sampleKey: "overallStrikeRate",
    sampleNoun: "frames",
    help: "Frames closed with a strike or a spare.",
  },
];

export const GOAL_TYPE_IDS = GOAL_TYPES.map(g => g.id);

export function goalType(id) {
  return GOAL_TYPES.find(g => g.id === id) || null;
}

// Same goal, named for the pin this bowler actually leaves. Applied at
// display time only -- nothing stored ever changes.
export function goalTypeFor(id, leftHanded = false) {
  const type = goalType(id);
  if (!type || !type.cornerPin || !leftHanded) return type;
  return {
    ...type,
    label: type.label.replace("10 Pin", "7 Pin"),
    sampleNoun: type.sampleNoun.replace("10 pin", "7 pin"),
  };
}

// Resolve a type's minimum sample. Types naming a shared threshold read it
// from insightGating so the two can't drift apart.
export function minSampleFor(type) {
  if (!type) return 0;
  if (type.sampleKey) return SAMPLE_THRESHOLDS[type.sampleKey] ?? 0;
  return type.minSample ?? 0;
}

export function normalizeGoal(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = goalType(raw.typeId);
  if (!type) return null;
  const target = Number(raw.target);
  if (!Number.isFinite(target)) return null;
  // Out-of-range targets are rejected rather than clamped: silently
  // turning a mistyped 3000 into 300 would look like the app agreed to
  // something the bowler didn't ask for.
  if (target < type.min || target > type.max) return null;
  return {
    typeId: type.id,
    // Scores are whole pins; percentages are whole points. Neither has a
    // meaningful fractional target.
    target: Math.round(target),
    createdAt: raw.createdAt || "",
    note: (raw.note || "").trim(),
  };
}

export function normalizeGoals(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const g of raw) {
    const n = normalizeGoal(g);
    // One goal per statistic. Two targets for the same stat would make
    // "am I on track?" ambiguous, which is the whole question.
    if (!n || seen.has(n.typeId)) continue;
    seen.add(n.typeId);
    out.push(n);
  }
  return out;
}

export function setGoal(goals, typeId, target, note = "") {
  const next = normalizeGoal({ typeId, target, note, createdAt: new Date().toISOString() });
  if (!next) return goals;
  return [...(goals || []).filter(g => g.typeId !== typeId), next];
}

export function removeGoal(goals, typeId) {
  return (goals || []).filter(g => g.typeId !== typeId);
}

// Progress for one goal.
//
// `current` is the measured value (null when unmeasurable), `sample` is
// how many observations it rests on. Returns a shape the UI can render
// without doing arithmetic of its own.
export function goalProgress(goal, current, sample, leftHanded = false) {
  const type = goalTypeFor(goal?.typeId, leftHanded);
  if (!type) return null;

  const need = minSampleFor(type);
  const n = Number.isFinite(sample) ? sample : 0;

  if (n < need) {
    return {
      typeId: type.id,
      label: type.label,
      unit: type.unit,
      target: goal.target,
      current: null,
      pct: null,
      met: false,
      // Not "0% of the way there" -- there is genuinely no answer yet.
      gated: true,
      sample: n,
      needed: need,
      remaining: need - n,
      sampleNoun: type.sampleNoun,
    };
  }

  if (current == null || !Number.isFinite(current)) {
    return {
      typeId: type.id, label: type.label, unit: type.unit,
      target: goal.target, current: null, pct: null, met: false,
      gated: false, noData: true,
      sample: n, needed: need, remaining: 0, sampleNoun: type.sampleNoun,
    };
  }

  // Progress is measured from zero, not from where they started. A bowler
  // averaging 180 chasing 200 is 90% of the way there, which is honest;
  // showing it as 0% because they haven't improved yet is not.
  const pct = goal.target > 0
    ? Math.max(0, Math.min(100, Math.round((current / goal.target) * 100)))
    : null;

  return {
    typeId: type.id,
    label: type.label,
    unit: type.unit,
    target: goal.target,
    current,
    pct,
    met: current >= goal.target,
    gated: false,
    sample: n,
    needed: need,
    remaining: 0,
    sampleNoun: type.sampleNoun,
    // How far short, in the stat's own units. Null once met.
    shortBy: current >= goal.target ? null : Math.round((goal.target - current) * 10) / 10,
  };
}

// All goals with their progress, ordered as GOAL_TYPES is so the list
// doesn't reshuffle as values change.
export function allGoalProgress(goals, measurements, leftHanded = false) {
  const byType = new Map((goals || []).map(g => [g.typeId, g]));
  const out = [];
  for (const type of GOAL_TYPES) {
    const goal = byType.get(type.id);
    if (!goal) continue;
    const m = (measurements && measurements[type.id]) || {};
    const p = goalProgress(goal, m.current ?? null, m.sample ?? 0, leftHanded);
    if (p) out.push(p);
  }
  return out;
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function goalsToRow(goals, bowler, userId) {
  return {
    // created_by, not user_id -- must match the column name in
    // migration_bowler_goals.sql and the RLS policies built on it. Both
    // conventions exist in this codebase (drills and tournaments use
    // user_id; arsenals, profiles and centers use created_by), so this one
    // follows its own table.
    created_by: userId || null,
    bowler_name: bowler || "",
    goals: normalizeGoals(goals),
  };
}

export function goalsFromRow(row) {
  return normalizeGoals(row?.goals);
}

// Measurements for ONE bowler in one league, computed from raw shots and
// sessions rather than from a caller's pre-filtered view.
//
// This exists because the Stats tab and the Log tab need the same numbers
// for different people. Stats is scoped to whoever is selected in its
// "Viewing" picker; the Log tab must always be the bowler actually at the
// line. Reusing the Stats-scoped values on the Log tab would show a
// teammate's goal progress to whoever is bowling -- the same class of
// mistake as a drill carrying across a bowler switch.
//
// The predicates are passed in rather than imported so this module stays
// free of splits.js and stats.js, matching how seriesFor already takes
// isSplit/isCornerPinLeave from its caller.
export function measurementsFor({
  shots, sessions, bowler, league,
  isSplit, isSinglePinLeave, isCornerPinLeave, leftHanded = false,
  average = null, highGame = null, highSeries = null,
}) {
  const mine = (Array.isArray(shots) ? shots : []).filter(s =>
    s && (bowler ? s.bowler === bowler : true) && (league ? s.league === league : true));

  const frameShots = mine.filter(s => !s.ballNum || s.ballNum === 1);
  const strikes = frameShots.filter(s => s.result === "Strike").length;
  const cleanFrames = frameShots.filter(s => s.result === "Strike" || s.spareMade === "Yes").length;

  const spareAttempts = mine.filter(s => s.result !== "Strike" && s.spareMade !== "" && !isSplit(s));
  const sparesMade = spareAttempts.filter(s => s.spareMade === "Yes").length;

  const singlePin = mine.filter(s => isSinglePinLeave(s) && s.spareMade !== "");
  const singlePinMade = singlePin.filter(s => s.spareMade === "Yes").length;

  const cornerPin = mine.filter(s => isCornerPinLeave(s, leftHanded) && s.spareMade !== "");
  const cornerPinMade = cornerPin.filter(s => s.spareMade === "Yes").length;

  const pct = (made, total) => (total ? Math.round((made / total) * 100) : null);

  return {
    // Session-derived figures come from the caller, which already has the
    // session helpers -- recomputing them here would duplicate that logic.
    average: { current: average, sample: 1 },
    highGame: { current: highGame, sample: 1 },
    highSeries: { current: highSeries, sample: 1 },
    strikeRate: { current: pct(strikes, frameShots.length), sample: frameShots.length },
    spareRate: { current: pct(sparesMade, spareAttempts.length), sample: spareAttempts.length },
    singlePinSpareRate: { current: pct(singlePinMade, singlePin.length), sample: singlePin.length },
    tenPinSpareRate: { current: pct(cornerPinMade, cornerPin.length), sample: cornerPin.length },
    cleanFrameRate: { current: pct(cleanFrames, frameShots.length), sample: frameShots.length },
  };
}
