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

export function targetLabel(targetId, customLabel) {
  if (targetId === "custom") return (customLabel || "").trim() || "Custom";
  return DRILL_TARGETS.find(t => t.id === targetId)?.label || targetId;
}

export function emptyDrill(bowler = "", date = "") {
  return {
    id: "",
    bowler,
    date,
    target: "10pin",
    customTarget: "",
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
    ball: raw.ball || "",
    made: n(raw.made),
    missed: n(raw.missed),
    notes: raw.notes || "",
  };
}

export function recordMade(drill) {
  return { ...drill, made: (drill.made || 0) + 1 };
}

export function recordMissed(drill) {
  return { ...drill, missed: (drill.missed || 0) + 1 };
}

// Undo the last tap. Can't know which it was, so the caller passes it.
export function undo(drill, wasMade) {
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
  return (drills || [])
    .filter(d => d.bowler === bowler && d.target === targetId && attempts(d) >= minAttempts)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(d => ({ date: d.date, rate: conversionRate(d), attempts: attempts(d), ball: d.ball }));
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function drillToRow(drill, userId) {
  return {
    id: drill.id,
    user_id: userId,
    bowler_name: drill.bowler,
    date: drill.date,
    target: drill.target,
    custom_target: drill.customTarget || null,
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
    ball: row.ball,
    made: row.made,
    missed: row.missed,
    notes: row.notes,
  });
}
