// Which stats cards have anything to show.
//
// A card that renders with nothing in it is worse than a card that isn't
// there. It reads as the app being broken rather than as data not
// existing yet -- and on a screen of thirty cards, a run of empty ones
// buries the handful that DO have something.
//
// This is the specific complaint after logging a league night as scores
// only: the scores arrived, and most of the screen was blank.
//
// Three kinds of card:
//
//   "scores"  works from game scores alone. Always available once a
//             night exists.
//   "shots"   needs shot-by-shot data. Strike percentage, leaves,
//             splits, frame position -- none of it can be derived from
//             a three-digit total.
//   "balls"   needs a ball recorded against a game or a shot. "By Ball"
//             with no ball noted is a single unnamed row.
//
// Pure: the caller passes the counts.

export const CARD_DATA_NEEDS = {
  // ── Shot-by-shot only ────────────────────────────────────────────────
  headlineStats: "shots",
  cleanFrames: "shots",
  framePosition: "shots",
  firstBallAverage: "shots",
  tenPinLeaves: "shots",
  singlePinSpares: "shots",
  splits: "shots",
  loneFivePin: "shots",
  nonSplitLeaves: "shots",
  strikeStreak: "shots",
  missDistribution: "shots",
  releaseQuality: "shots",
  strikeQuality: "shots",
  theoreticalAverage: "shots",
  hung: "shots",

  // ── Needs a ball recorded ────────────────────────────────────────────
  byBall: "balls",
  ballChangeTriggers: "balls",

  // Everything not listed works from scores alone. Defaulting that way
  // round is deliberate: a new card is visible until someone says
  // otherwise, which fails toward showing too much rather than silently
  // hiding something that worked.
};

export function cardNeeds(cardId) {
  return CARD_DATA_NEEDS[cardId] || "scores";
}

// Whether a card can show anything, given what has been logged.
export function cardHasData(cardId, counts) {
  // Destructured in the BODY, not the parameter list: `= {}` defaults
  // only an UNDEFINED argument, so a null threw before any guard could
  // run. Same trap as the six functions fixed during the fuzz work --
  // and it caught me again writing this file.
  const { shotCount = 0, ballCount = 0 } =
    (counts && typeof counts === "object" && !Array.isArray(counts)) ? counts : {};
  const need = cardNeeds(cardId);
  if (need === "shots") return Number(shotCount) > 0;
  if (need === "balls") return Number(ballCount) > 0;
  return true;
}

export function visibleStatsCards(cardIds, counts) {
  if (!Array.isArray(cardIds)) return [];
  return cardIds.filter(id => cardHasData(id, counts || {}));
}

// What to tell someone about the cards they are not seeing.
//
// Returns null when there is nothing to say -- either everything is
// showing, or nothing has been logged at all, in which case an empty
// stats screen needs no explanation beyond its own empty state.
//
// The wording names the ACTION, not the deficiency: "track shot by shot"
// rather than "you have no shot data". And it says what is gained, since
// the cost is real -- shot-by-shot takes longer at the lanes, and it
// should be a choice rather than a nag.
export function lockedStatsMessage(cardIds, counts) {
  const c = counts || {};
  const shotCount = Number(c.shotCount) || 0;
  const ballCount = Number(c.ballCount) || 0;
  const ids = Array.isArray(cardIds) ? cardIds : [];

  const hiddenShots = ids.filter(id => cardNeeds(id) === "shots").length && shotCount === 0
    ? ids.filter(id => cardNeeds(id) === "shots").length : 0;
  const hiddenBalls = ids.filter(id => cardNeeds(id) === "balls").length && ballCount === 0
    ? ids.filter(id => cardNeeds(id) === "balls").length : 0;

  if (!hiddenShots && !hiddenBalls) return null;

  const total = hiddenShots + hiddenBalls;
  const plural = total === 1 ? "stat" : "stats";

  if (hiddenShots && hiddenBalls) {
    return `${total} more ${plural} unlock when you track shot by shot and note which ball you used each game.`;
  }
  if (hiddenShots) {
    return `${total} more ${plural} unlock when you track shot by shot — strikes, spares, leaves and splits all come from individual shots.`;
  }
  return `${total} more ${plural} unlock when you note which ball you used each game.`;
}
