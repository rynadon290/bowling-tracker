// When to offer shot-by-shot tracking.
//
// Focus group Finding 3: shot-by-shot is the feature that converts
// serious users -- of the 12 established league bowlers (out of 50) who
// found it, 11 said it was the reason they would keep the app. Three
// quarters never found it at all. The basics tour explains it, but the
// tour is 12 steps and 34 of 250 skipped it.
//
// The default is NOT changing. Round 5 showed shot-by-shot bounces
// beginners, and a default that costs you novices to convert veterans is
// a bad trade. The fix is to offer it at the moment it means something,
// which is after someone has logged a few nights and has data the
// detailed view would actually explain.
//
// Pure: no storage, no React, no dates beyond what is passed in. The
// caller supplies the dismissal state and today's date.

// How many scores-only nights before offering. Three is the point where
// a bowler has a pattern rather than a first outing -- and it is late
// enough that the prompt can promise something concrete ("which spares
// are costing you") rather than pitching a feature in the abstract.
export const NIGHTS_BEFORE_OFFER = 3;

// A session counts as scores-only when it has no per-ball detail. Not
// `shotCount === 0`: a session object arriving without the field at all
// is the same situation, and a strict equality check would silently skip
// it. Both mean "this night was logged as totals".
export function isScoresOnlyNight(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) return false;
  const n = session.shotCount;
  return !(typeof n === "number" && n > 0);
}

// Nights this bowler has logged without per-ball detail.
//
// Filtered by bowler because one device scores for a whole team: a
// captain who logs four teammates' scores has four sessions a night, and
// counting all of them would fire the prompt after a single evening.
export function scoresOnlyNightCount(sessions, bowler) {
  if (!Array.isArray(sessions) || !bowler) return 0;
  return sessions.filter(s => s && s.bowler === bowler && isScoresOnlyNight(s)).length;
}

// Should the prompt be shown?
//
// Every condition is a reason NOT to nag:
//   - already tracking shot by shot      -> nothing to offer
//   - casual mode                        -> "just the scores" is the
//                                           entire point of that mode
//   - dismissed once                     -> asked and answered, forever
//   - fewer than three scores-only nights -> too early to mean anything
//
// The casual exclusion matters. Finding 4 says casual mode is the
// strongest part of the app precisely because it does not ask anything
// of you; a prompt to track more detail is the one thing guaranteed to
// spoil it.
export function shouldOfferShotByShot(options) {
  // A default parameter covers undefined, not null.
  const o = (options && typeof options === "object") ? options : {};
  const { sessions, bowler, trackingMode, environment, dismissed } = o;

  if (dismissed) return false;
  if (trackingMode === "shot") return false;
  if (environment === "casual") return false;

  return scoresOnlyNightCount(sessions, bowler) >= NIGHTS_BEFORE_OFFER;
}
