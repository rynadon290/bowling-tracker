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
function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function specsToRow(specs) {
  return {
    group_id: specs.groupId || null,
    coverstock: specs.coverstock || null,
    core_type: specs.coreType || null,
    weight: num(specs.weight),
    rg: num(specs.rg),
    diff: num(specs.diff),
    int_diff: specs.coreType === "asymmetric" ? num(specs.intDiff) : null,
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
