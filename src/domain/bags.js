// Ball bags.
//
// A bowler carries different equipment to league than to a tournament, and
// tournaments frequently cap how many balls you may bring -- so one bowler
// needs several tournament bags sized to different rules ("short pattern
// 5 ball + plastic").
//
// Three ideas here, kept deliberately separate:
//
//   1. A BAG is a named container with a type (league/tournament), an
//      optional ball limit, and whether plastic rides along.
//   2. A BALL belongs to at most one bag. A ball with no bag is
//      "unassigned" -- entered, but not packed for anything yet.
//   3. Which balls are AVAILABLE depends on environment: league and
//      tournament show the selected bag; practice shows everything,
//      including unassigned balls, because practice is where you try
//      equipment that isn't in a competitive bag yet.
//
// The plastic rule matters for the limit: tournaments that say "5 balls
// plus a plastic" mean the plastic doesn't count against the 5. So the
// effective capacity is limit + (includesPlastic ? 1 : 0), and a bag can
// legitimately hold 6 balls while its limit reads 5.

export const BAG_TYPES = ["league", "tournament"];

export const BAG_TYPE_LABELS = {
  league: "League",
  tournament: "Tournament",
};

export function emptyBag(bowlerName = "", bagType = "league") {
  return {
    id: "",
    bowlerName,
    name: "",
    bagType: BAG_TYPES.includes(bagType) ? bagType : "league",
    ballLimit: "",
    includesPlastic: false,
  };
}

export function normalizeBag(raw, bowlerName = "") {
  const base = emptyBag(bowlerName);
  if (!raw || typeof raw !== "object") return base;
  return {
    id: raw.id || "",
    bowlerName: raw.bowlerName || bowlerName,
    name: raw.name || "",
    bagType: BAG_TYPES.includes(raw.bagType) ? raw.bagType : "league",
    ballLimit: raw.ballLimit === null || raw.ballLimit === undefined ? "" : String(raw.ballLimit),
    includesPlastic: !!raw.includesPlastic,
  };
}

// How many balls this bag may hold. A plastic allowance sits OUTSIDE the
// stated limit, which is how tournaments actually word the rule.
// Returns null when there's no limit at all (the normal league case).
export function bagCapacity(bag) {
  const limit = bag?.ballLimit;
  if (limit === "" || limit === null || limit === undefined) return null;
  const n = Number(limit);
  if (Number.isNaN(n) || n < 0) return null;
  return n + (bag.includesPlastic ? 1 : 0);
}

export function bagBallCount(ballsByBag, bagId) {
  return (ballsByBag?.[bagId] || []).length;
}

// Whether another ball still fits. No limit means always yes.
export function bagHasRoom(bag, ballsByBag) {
  const capacity = bagCapacity(bag);
  if (capacity === null) return true;
  return bagBallCount(ballsByBag, bag.id) < capacity;
}

// Human-readable capacity, e.g. "5 + plastic" or "6 balls" or "No limit".
export function describeCapacity(bag) {
  const limit = bag?.ballLimit;
  if (limit === "" || limit === null || limit === undefined) return "No limit";
  const n = Number(limit);
  if (Number.isNaN(n)) return "No limit";
  return bag.includesPlastic ? `${n} + plastic` : `${n} ball${n === 1 ? "" : "s"}`;
}

// The balls available to pick from, given the environment and selected bag.
//
// Practice sees EVERYTHING -- every ball in every bag plus unassigned ones,
// deduped. League and tournament see only the chosen bag. This is the whole
// point of bags: competitive play is constrained, practice isn't.
export function availableBalls(environment, ballsByBag, selectedBagId, allBalls) {
  if (environment === "practice") {
    return [...new Set(allBalls || [])];
  }
  if (!selectedBagId) return [];
  return [...new Set(ballsByBag?.[selectedBagId] || [])];
}

// Bags a given environment should offer. Practice gets none -- it isn't
// bag-constrained -- and the UI shows every ball instead.
export function bagsForEnvironment(bags, environment) {
  const list = Array.isArray(bags) ? bags : [];
  if (environment === "tournament") return list.filter(b => b.bagType === "tournament");
  if (environment === "league") return list.filter(b => b.bagType === "league");
  return [];
}

// Balls entered but not packed into any bag.
export function unassignedBalls(allBalls, ballsByBag) {
  const assigned = new Set(Object.values(ballsByBag || {}).flat());
  return (allBalls || []).filter(b => !assigned.has(b));
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function bagToRow(bag, userId) {
  const limit = bag.ballLimit === "" || bag.ballLimit === null || bag.ballLimit === undefined
    ? null
    : Number(bag.ballLimit);
  return {
    id: bag.id,
    created_by: userId,
    bowler_name: bag.bowlerName,
    name: bag.name,
    bag_type: bag.bagType,
    ball_limit: Number.isNaN(limit) ? null : limit,
    includes_plastic: !!bag.includesPlastic,
  };
}

export function bagFromRow(row) {
  if (!row) return null;
  return normalizeBag({
    id: row.id,
    bowlerName: row.bowler_name || "",
    name: row.name || "",
    bagType: row.bag_type || "league",
    ballLimit: row.ball_limit,
    includesPlastic: !!row.includes_plastic,
  });
}
