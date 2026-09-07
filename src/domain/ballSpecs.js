// Ball specifications and grouping.
//
// GROUPING exists because a serious bowler's arsenal is a long list, and
// scanning it by name tells you nothing about what each ball does. The
// seven seeded groups are the vocabulary bowlers already use to describe
// a ball's role, but they're just starting rows -- rename, delete, add
// your own.
//
// You can also group by coverstock or core, which needs no setup at all
// since those come from the ball's specs.
//
// SPECS note: intermediate differential only exists on asymmetric balls.
// A symmetric ball has no intermediate differential, so the field is
// hidden and cleared rather than sitting there inviting a wrong number.

export const DEFAULT_BALL_GROUPS = [
  "Strong - Smooth",
  "Strong - Sharp",
  "Benchmark - Smooth",
  "Benchmark - Sharp",
  "Weak - Smooth",
  "Weak - Sharp",
  "Urethane",
];

export const COVERSTOCKS = ["solid", "pearl", "hybrid"];
export const CORE_TYPES = ["symmetric", "asymmetric"];

export const COVERSTOCK_LABELS = { solid: "Solid", pearl: "Pearl", hybrid: "Hybrid" };
export const CORE_TYPE_LABELS = { symmetric: "Symmetric", asymmetric: "Asymmetric" };

// How the arsenal can be organised. "group" is the bowler's own grouping;
// the other two are derived from specs and need no setup.
export const GROUP_MODES = ["group", "coverstock", "core", "none"];
export const GROUP_MODE_LABELS = {
  group: "My Groups",
  coverstock: "Coverstock",
  core: "Core",
  none: "All Balls",
};

export function emptyBallSpecs() {
  return {
    groupId: "",
    coverstock: "",
    coreType: "",
    weight: "",
    rg: "",
    diff: "",
    intDiff: "",
  };
}

export function normalizeBallSpecs(raw) {
  const base = emptyBallSpecs();
  if (!raw || typeof raw !== "object") return base;
  const coreType = CORE_TYPES.includes(raw.coreType) ? raw.coreType : "";
  return {
    groupId: raw.groupId || "",
    coverstock: COVERSTOCKS.includes(raw.coverstock) ? raw.coverstock : "",
    coreType,
    weight: raw.weight === null || raw.weight === undefined ? "" : String(raw.weight),
    rg: raw.rg === null || raw.rg === undefined ? "" : String(raw.rg),
    diff: raw.diff === null || raw.diff === undefined ? "" : String(raw.diff),
    // Symmetric balls have no intermediate differential. Carrying a value
    // here for one would be meaningless data that later reads as fact.
    intDiff: coreType === "asymmetric" && raw.intDiff !== null && raw.intDiff !== undefined
      ? String(raw.intDiff)
      : "",
  };
}

// Changing core type has to clear intDiff when moving to symmetric,
// otherwise a stale asymmetric value silently survives.
export function setSpecField(specs, field, value) {
  const next = { ...specs, [field]: value };
  if (field === "coreType" && value !== "asymmetric") next.intDiff = "";
  return next;
}

export function hasAnySpecs(specs) {
  if (!specs) return false;
  return ["coverstock", "coreType", "weight", "rg", "diff", "intDiff"]
    .some(k => specs[k] !== "" && specs[k] !== null && specs[k] !== undefined);
}

// A one-line summary for showing under a ball name, e.g.
// "15lb · Solid · Asymmetric · RG 2.47 / Diff .055 / Int .021"
export function describeSpecs(specs) {
  if (!specs) return "";
  const parts = [];
  if (specs.weight) parts.push(`${specs.weight}lb`);
  if (specs.coverstock) parts.push(COVERSTOCK_LABELS[specs.coverstock]);
  if (specs.coreType) parts.push(CORE_TYPE_LABELS[specs.coreType]);
  const nums = [];
  if (specs.rg) nums.push(`RG ${specs.rg}`);
  if (specs.diff) nums.push(`Diff ${specs.diff}`);
  if (specs.coreType === "asymmetric" && specs.intDiff) nums.push(`Int ${specs.intDiff}`);
  if (nums.length) parts.push(nums.join(" / "));
  return parts.join(" · ");
}

// Buckets balls for display. Returns [{ key, label, balls }] in a stable
// order, with anything unclassified collected at the end rather than
// dropped -- a ball with no specs still has to be reachable.
export function groupBalls(mode, balls, specsByBall, groups) {
  const list = balls || [];
  if (mode === "none" || !mode) {
    return [{ key: "all", label: "All Balls", balls: list }];
  }

  if (mode === "group") {
    const out = (groups || []).map(g => ({
      key: g.id,
      label: g.name,
      balls: list.filter(b => specsByBall?.[b]?.groupId === g.id),
    }));
    const knownIds = new Set((groups || []).map(g => g.id));
    const ungrouped = list.filter(b => {
      const id = specsByBall?.[b]?.groupId;
      return !id || !knownIds.has(id);
    });
    if (ungrouped.length) out.push({ key: "ungrouped", label: "Ungrouped", balls: ungrouped });
    return out.filter(s => s.balls.length > 0);
  }

  const field = mode === "coverstock" ? "coverstock" : "coreType";
  const values = mode === "coverstock" ? COVERSTOCKS : CORE_TYPES;
  const labels = mode === "coverstock" ? COVERSTOCK_LABELS : CORE_TYPE_LABELS;
  const out = values.map(v => ({
    key: v,
    label: labels[v],
    balls: list.filter(b => specsByBall?.[b]?.[field] === v),
  }));
  const unspecified = list.filter(b => !values.includes(specsByBall?.[b]?.[field]));
  if (unspecified.length) out.push({ key: "unspecified", label: "Not specified", balls: unspecified });
  return out.filter(s => s.balls.length > 0);
}

// ── Supabase mapping ────────────────────────────────────────────────────
function num(v, min, max) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Out-of-range values are typos, not specs. Better to store nothing than
  // to record a 100lb ball or a negative RG that later reads as fact.
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

// Bounds track the USBC Equipment Specifications and Certifications Manual,
// verified against bowl.com's published spec rather than assumed:
//   - Weight: max 16.00 lb, no official minimum (6-16 lb is the commercial
//     range balls are actually sold in, not a rule)
//   - RG: 2.447"-2.813" for an individual ball (2.460"-2.800" averaged
//     across a weight class -- we don't have a weight class here, so the
//     individual-ball bound is the correct one to use)
//   - Differential RG: max 0.060", no minimum
//
// These are NOT a competition-legality check -- the app doesn't verify a
// ball is tournament-certified. They exist to catch typos (an extra digit,
// a misplaced decimal) without rejecting a real ball, so each bound adds a
// small explicit margin beyond the certified range rather than the
// certified range itself.
export function specsToRow(specs) {
  return {
    group_id: specs.groupId || null,
    coverstock: specs.coverstock || null,
    core_type: specs.coreType || null,
    weight: num(specs.weight, 6, 16),
    rg: num(specs.rg, 2.4, 2.85),
    diff: num(specs.diff, 0, 0.07),
    int_diff: specs.coreType === "asymmetric" ? num(specs.intDiff, 0, 0.07) : null,
  };
}

export function specsFromRow(row) {
  if (!row) return emptyBallSpecs();
  return normalizeBallSpecs({
    groupId: row.group_id || "",
    coverstock: row.coverstock || "",
    coreType: row.core_type || "",
    weight: row.weight,
    rg: row.rg,
    diff: row.diff,
    intDiff: row.int_diff,
  });
}

// A ball's RG and differential genuinely shift by weight -- a 12lb and a
// 16lb version of the same ball are not the same numbers with a different
// label. `weightSpecs`, when present, is an array of per-weight
// breakdowns: [{weight, rg, diff, intDiff}, ...]. This picks the exact
// weight match if the entry has one; otherwise it falls back to the
// entry's single reference-weight specs (the shape every community
// submission already has, since a bowler only owns one weight of their
// own ball).
//
// Deliberately exact-match only, not nearest-weight: a 14lb bowler asking
// for specs and silently getting 15lb numbers back would look correct
// while being wrong. No match means "we don't have this weight," not "an
// approximation."
export function specsForWeight(entry, weight) {
  const target = Number(weight);
  if (Number.isFinite(target) && Array.isArray(entry?.weightSpecs)) {
    const exact = entry.weightSpecs.find(w => Number(w.weight) === target);
    if (exact) {
      return normalizeBallSpecs({
        groupId: entry.specs?.groupId || "",
        coverstock: entry.specs?.coverstock || "",
        coreType: entry.specs?.coreType || "",
        weight: exact.weight,
        rg: exact.rg,
        diff: exact.diff,
        intDiff: exact.intDiff,
      });
    }
  }
  return entry?.specs || emptyBallSpecs();
}

export function groupToRow(group, userId) {
  return {
    id: group.id,
    created_by: userId,
    bowler_name: group.bowlerName,
    name: group.name,
    sort_order: group.sortOrder ?? 0,
  };
}

export function groupFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    bowlerName: row.bowler_name || "",
    name: row.name || "",
    sortOrder: row.sort_order ?? 0,
  };
}
