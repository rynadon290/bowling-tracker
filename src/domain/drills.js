// Practice drills.
//
// A drill is a focused repetition -- "30 shots at the 10 pin" -- scored as
// a conversion rate, not as a game. Logging one as a game would poison the
// average with 30 "frames" that were never part of a game, and logging it
// as free-form shots loses the thing that makes a drill useful: the count
// of attempts against a single target.
//
// Deliberately simple: pick a target, tap Made or Missed, see the rate.
// Anything more elaborate becomes a coaching product.

import { mirrorPin, mirrorLeave } from "./splits.js";

export const DRILL_TARGETS = [
  { id: "10pin", label: "10 Pin", short: "10" },
  { id: "7pin", label: "7 Pin", short: "7" },
  { id: "4pin", label: "4 Pin", short: "4" },
  { id: "6pin", label: "6 Pin", short: "6" },
  { id: "2pin", label: "2 Pin", short: "2" },
  { id: "3pin", label: "3 Pin", short: "3" },
  { id: "3-6-10", label: "3-6-10 (bucket-ish)", short: "3-6-10" },
  { id: "2-4-5", label: "2-4-5 (bucket)", short: "2-4-5" },
  { id: "6-10", label: "6-10", short: "6-10" },
  { id: "4-7", label: "4-7", short: "4-7" },
  { id: "strike", label: "Strike Ball (pocket hits)", short: "Pocket" },
  { id: "custom", label: "Custom", short: "Custom" },
];

// Mirrors a hyphenated pin-combo id ("3-6-10") across the deck's
// centerline. Single-pin ids like "10pin" don't match the pattern and
// pass through unchanged -- deliberately: both corners (and both halves
// of every other single pin) are ALREADY separate, correctly-labeled
// options in DRILL_TARGETS, so a lefty picks "7 Pin" directly rather than
// a relabeled "10 Pin". Only combos whose mirror ISN'T already a separate
// listed option need their label to flip.
function mirrorTargetId(id) {
  if (!/^\d+(-\d+)+$/.test(id)) return id;
  return id.split("-").map(Number).map(mirrorPin).sort((a, b) => a - b).join("-");
}

// A lefty's ball approaches the pocket from the opposite side, so a
// combo named for a righty's near-side shape ("3-6-10") is a DIFFERENT,
// much rarer geometry for her -- her equivalent shape is its mirror
// ("2-4-7"). The stored target id stays "3-6-10" for both hands (so
// history and cross-bowler drill comparison keep working off one
// canonical id, the same convention "Weak 10"/"Weak 7" already
// established) -- only the label a lefty SEES flips to her real pins.
// Only real pin numbers, deduped and ordered, so "3,3,6" and "6-3" mean
// the same target.
export function normalizeCustomPins(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const p of (Array.isArray(raw) ? raw : [])) {
    const n = Number(p);
    if (Number.isInteger(n) && n >= 1 && n <= 10) seen.add(String(n));
  }
  return [...seen].sort((a, b) => Number(a) - Number(b));
}

// A hand-agnostic key for a custom pin set, so a lefty's 2-4-7 and a
// righty's 3-6-10 group as the SAME drill -- exactly like the built-in
// combo targets, whose stored id is canonical for both hands. A lefty's
// pins are mirrored back to right-handed orientation to form the key.
export function customPinKey(pins, leftHanded = false) {
  const clean = normalizeCustomPins(pins);
  if (!clean.length) return "";
  const canonical = leftHanded ? mirrorLeave(clean) : clean;
  return normalizeCustomPins(canonical).join("-");
}

export function targetLabel(targetId, customLabel, leftHanded = false, customPins = []) {
  if (targetId === "custom") {
    const name = (customLabel || "").trim();
    const pins = normalizeCustomPins(customPins);
    // Pins already reflect the hand that logged them, so they're shown
    // as-is; the mirroring happens in customPinKey for grouping only.
    if (pins.length && name) return `${name} (${pins.join("-")})`;
    if (pins.length) return pins.join("-");
    return name || "Custom";
  }
  const entry = DRILL_TARGETS.find(t => t.id === targetId);
  if (!entry) return targetId;
  if (!leftHanded) return entry.label;
  const mirrored = mirrorTargetId(targetId);
  // Unchanged if this id has no mirror (single pins, "strike", "custom")
  // or if the mirror is already its own separate listed option (6-10/4-7).
  if (mirrored === targetId || DRILL_TARGETS.some(t => t.id === mirrored)) return entry.label;
  return entry.label.replace(targetId, mirrored);
}

// Same mirroring for the picker's short chip label.
export function targetShortLabel(targetId, leftHanded = false) {
  const entry = DRILL_TARGETS.find(t => t.id === targetId);
  if (!entry) return targetId;
  if (!leftHanded) return entry.short;
  const mirrored = mirrorTargetId(targetId);
  if (mirrored === targetId || DRILL_TARGETS.some(t => t.id === mirrored)) return entry.short;
  return mirrored;
}

export function emptyDrill(bowler = "", date = "", leftHanded = false) {
  return {
    id: "",
    bowler,
    date,
    target: leftHanded ? "7pin" : "10pin",
    customTarget: "",
    // Optional pin set for a custom target, as pin-number strings.
    // Free-text names ("Greek Church") stay supported; pins are what make
    // a custom drill comparable across bowlers and mirrorable for a lefty.
    customPins: [],
    ball: "",
    made: 0,
    missed: 0,
    notes: "",
  };
}

export function normalizeDrill(raw) {
  const base = emptyDrill();
  if (!raw || typeof raw !== "object") return base;
  const n = v => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 0 ? x : 0; };
  return {
    id: raw.id || "",
    bowler: raw.bowler || "",
    date: raw.date || "",
    target: DRILL_TARGETS.some(t => t.id === raw.target) ? raw.target : "10pin",
    customTarget: raw.customTarget || "",
    customPins: normalizeCustomPins(raw.customPins),
    ball: raw.ball || "",
    made: n(raw.made),
    missed: n(raw.missed),
    notes: raw.notes || "",
  };
}

export function recordMade(drill) {
  if (!drill || typeof drill !== "object") return drill;
  return { ...drill, made: (drill.made || 0) + 1 };
}

export function recordMissed(drill) {
  if (!drill || typeof drill !== "object") return drill;
  return { ...drill, missed: (drill.missed || 0) + 1 };
}

// Undo the last tap. Can't know which it was, so the caller passes it.
export function undo(drill, wasMade) {
  if (!drill || typeof drill !== "object") return drill;
  if (wasMade) return { ...drill, made: Math.max(0, (drill.made || 0) - 1) };
  return { ...drill, missed: Math.max(0, (drill.missed || 0) - 1) };
}

export function attempts(drill) {
  return (drill?.made || 0) + (drill?.missed || 0);
}

// Null until there's at least one attempt -- "0%" before you've thrown a
// ball isn't a rate, it's an absence.
export function conversionRate(drill) {
  const n = attempts(drill);
  return n ? Math.round(((drill.made || 0) / n) * 100) : null;
}

// Trend for one target across drills, newest last, for "is my 10-pin
// getting better". Only drills with enough attempts to mean something.
export function targetHistory(drills, bowler, targetId, minAttempts = 10) {
  // Null ELEMENTS, not just a null list.
  //
  // Array.isArray() says the container is a list and nothing about
  // what is in it. A half-written row, a partial import, a merge that
  // dropped something -- any of them puts a null in here, and the
  // property access two lines down took a whole screen with it.
  drills = (Array.isArray(drills) ? drills : []).filter(x => x && typeof x === "object");
  return (Array.isArray(drills) ? drills : [])
    .filter(d => d.bowler === bowler && d.target === targetId && attempts(d) >= minAttempts)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(d => ({ date: d.date, rate: conversionRate(d), attempts: attempts(d), ball: d.ball }));
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function drillToRow(drill, userId) {
  if (!drill || typeof drill !== "object") return null;
  return {
    id: drill.id,
    user_id: userId,
    bowler_name: drill.bowler,
    date: drill.date,
    target: drill.target,
    custom_target: drill.customTarget || null,
    custom_pins: (drill.customPins && drill.customPins.length) ? drill.customPins : null,
    ball: drill.ball || null,
    made: drill.made || 0,
    missed: drill.missed || 0,
    notes: drill.notes || null,
  };
}

export function drillFromRow(row) {
  if (!row) return null;
  return normalizeDrill({
    id: row.id,
    bowler: row.bowler_name,
    date: row.date,
    target: row.target,
    customTarget: row.custom_target,
    customPins: row.custom_pins,
    ball: row.ball,
    made: row.made,
    missed: row.missed,
    notes: row.notes,
  });
}

// ── History by week ─────────────────────────────────────────────────────
//
// targetHistory above lists individual sessions, which is the right thing
// while you're standing there. Over a season it's noise: 14/50 practice
// bowlers asked to see whether a target is actually improving, and a list
// of one-off percentages doesn't answer that.
//
// Weekly buckets pool every drill at a target in the same week, so the
// rate is computed from combined attempts rather than averaging small
// per-session percentages -- which would let a 2-attempt session swing a
// week as hard as a 40-attempt one.

// Monday-start week key. Local date parts, not UTC: a Thursday-night
// league west of UTC is already Friday in ISO terms, which would scatter
// one league's drills across two buckets.
export function weekStart(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setDate(dt.getDate() - dow);
  const pad = n => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function weeklyTargetHistory(drills, bowler, targetId, { customPins = null, minAttempts = 5 } = {}) {
  const key = customPins && customPins.length ? customPinKey(customPins) : null;
  const mine = (Array.isArray(drills) ? drills : []).filter(d => {
    if (!d || d.bowler !== bowler || attempts(d) <= 0) return false;
    if (d.target !== targetId) return false;
    // A custom target only matches another custom target with the same pins.
    if (targetId === "custom") return key ? customPinKey(d.customPins) === key : true;
    return true;
  });

  const byWeek = new Map();
  for (const d of (Array.isArray(mine) ? mine : [])) {
    const wk = weekStart(d.date);
    if (!wk) continue;
    if (!byWeek.has(wk)) byWeek.set(wk, { week: wk, made: 0, missed: 0, sessions: 0 });
    const b = byWeek.get(wk);
    b.made += d.made || 0;
    b.missed += d.missed || 0;
    b.sessions += 1;
  }

  return [...byWeek.values()]
    .map(b => ({
      week: b.week,
      made: b.made,
      attempts: b.made + b.missed,
      sessions: b.sessions,
      rate: Math.round((b.made / (b.made + b.missed)) * 100),
      // Flagged rather than dropped: a thin week is still real work, it
      // just shouldn't be read as a data point.
      thin: b.made + b.missed < minAttempts,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

// Direction across the weekly buckets that have enough attempts to count.
// Deliberately conservative: needs at least three usable weeks, and calls
// anything inside a few points "steady" rather than manufacturing a story.
export function weeklyTrend(weeks) {
  // Null ELEMENTS, not just a null list.
  //
  // Array.isArray() says the container is a list and nothing about
  // what is in it. A half-written row, a partial import, a merge that
  // dropped something -- any of them puts a null in here, and the
  // property access two lines down took a whole screen with it.
  weeks = (Array.isArray(weeks) ? weeks : []).filter(x => x && typeof x === "object");
  const usable = (Array.isArray(weeks) ? weeks : []).filter(w => !w.thin);
  if (usable.length < 3) return { direction: "unknown", weeks: usable.length };
  const firstHalf = usable.slice(0, Math.floor(usable.length / 2));
  const lastHalf = usable.slice(Math.ceil(usable.length / 2));
  const avg = list => list.reduce((a, w) => a + w.rate, 0) / list.length;
  const change = Math.round(avg(lastHalf) - avg(firstHalf));
  if (Math.abs(change) < 5) return { direction: "steady", change, weeks: usable.length };
  return { direction: change > 0 ? "up" : "down", change, weeks: usable.length };
}
