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
export function goalProgress(goal, current, sample) {
  const type = goalType(goal?.typeId);
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
export function allGoalProgress(goals, measurements) {
  const byType = new Map((goals || []).map(g => [g.typeId, g]));
  const out = [];
  for (const type of GOAL_TYPES) {
    const goal = byType.get(type.id);
    if (!goal) continue;
    const m = (measurements && measurements[type.id]) || {};
    const p = goalProgress(goal, m.current ?? null, m.sample ?? 0);
    if (p) out.push(p);
  }
  return out;
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function goalsToRow(goals, bowler, userId) {
  return {
    user_id: userId || null,
    bowler_name: bowler || "",
    goals: normalizeGoals(goals),
  };
}

export function goalsFromRow(row) {
  return normalizeGoals(row?.goals);
}
