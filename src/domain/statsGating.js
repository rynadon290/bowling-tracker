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
// What to tell someone about the cards they are not seeing.
//
// Returns null when there is nothing to say -- either everything is
// showing, or nothing has been logged at all, in which case an empty
// stats screen needs no explanation beyond its own empty state.
//
// The two counts are stated SEPARATELY, not joined with "and".
//
// They are independent choices, and the earlier wording implied both
// were needed for all of them: you can note which ball bowled a game
// without tracking a single frame, which is exactly what the per-game
// ball dropdown is for. Someone logging scores only might happily do
// the ball and never the frames -- so tell them what each one buys and
// let them pick.
//
// The wording names the ACTION rather than the deficiency -- "track shot
// by shot" rather than "you have no shot data" -- and says what is
// gained, since shot-by-shot is real extra effort at the lanes and
// should stay a choice rather than a nag.
export function lockedStatsMessage(cardIds, counts) {
  const c = (counts && typeof counts === "object" && !Array.isArray(counts)) ? counts : {};
  const shotCount = Number(c.shotCount) || 0;
  const ballCount = Number(c.ballCount) || 0;
  const ids = Array.isArray(cardIds) ? cardIds : [];

  const shotLocked = shotCount === 0 ? ids.filter(id => cardNeeds(id) === "shots").length : 0;
  const ballLocked = ballCount === 0 ? ids.filter(id => cardNeeds(id) === "balls").length : 0;
  if (!shotLocked && !ballLocked) return null;

  // "1 stat unlock" and "2 stats unlocks" are both wrong, so the verb
  // agrees with the count as well as the noun.
  const phrase = (n, how) =>
    `${n} ${n === 1 ? "stat unlocks" : "stats unlock"} if you ${how}`;

  const parts = [];
  if (shotLocked) parts.push(phrase(shotLocked, "track shot by shot"));
  if (ballLocked) parts.push(phrase(ballLocked, "note which ball bowled each game"));

  // The reassurance only makes sense when there are two things to
  // choose between. Tacked onto a single option it reads as an
  // apology for a choice nobody was offered.
  return parts.length > 1
    ? `${parts.join(". ")}. Either on its own is fine.`
    : `${parts[0]}.`;
}
