// Crowdsourced ball catalog.
//
// The problem this solves: one user editing a spec that was already correct
// for a hundred others. So catalog entries move through states, and a
// well-supported entry becomes read-only.
//
//   new       -- just submitted, nobody else has weighed in
//   approved  -- enough people agree to trust it, still editable
//   verified  -- so many people agree that it locks; no more edits
//   rejected  -- enough people flagged it wrong; the entry is removed
//
// Two deliberate decisions worth stating:
//
// 1. VERIFIED LOCKS EDITING. Once a ball has broad agreement, letting one
//    person change it is exactly the failure we're preventing. Correcting a
//    verified entry requires rejecting it first, which needs several people
//    -- the same bar that made it verified.
//
// 2. REJECTION NEVER DELETES THE BALL NAME. A bowler who owns a "Phaze II"
//    knows they own it; only the specs were disputed. Rejection clears the
//    specs and tells them, but the ball stays in their arsenal. Deleting
//    equipment out from under someone because strangers disagreed about RG
//    would be worse than wrong data.

export const CATALOG_STATES = ["official", "new", "approved", "verified", "rejected"];

// Approvals needed to move from new -> approved. Two independent people
// agreeing is meaningfully better than one asserting.
export const APPROVAL_THRESHOLD = 2;

// Approvals needed to lock as verified. Set well above the approval bar so
// locking reflects real consensus rather than a couple of agreeable users.
export const VERIFICATION_THRESHOLD = 5;

// Rejections that remove the entry. Matched to the approval threshold: two
// people disputing an entry is exactly as meaningful as two agreeing with
// it, and wrong specs are more costly than a missing one -- a bowler can
// re-enter specs, but can't easily tell that numbers they trusted are bad.
export const REJECTION_THRESHOLD = 2;

export function catalogState(entry) {
  // Official entries are manufacturer-sourced, not peer-voted -- checked
  // first and unconditionally, since they never accumulate approvals or
  // rejections at all (canVote below refuses to let anyone vote on one).
  if (entry?.official) return "official";

  const approvals = entry?.approvals ?? 0;
  const rejections = entry?.rejections ?? 0;

  // Verification is terminal and checked FIRST. Once an entry reaches the
  // approval threshold it locks, and voting stops -- so it can never
  // subsequently accumulate rejections. Checking rejection first would mean
  // a verified entry could be un-verified by votes that can't be cast.
  //
  // The two outcomes are a race: whichever threshold is crossed first wins.
  // An entry only reaches "rejected" if it collected enough rejections
  // BEFORE reaching the verification threshold.
  if (approvals >= VERIFICATION_THRESHOLD) return "verified";
  if (rejections >= REJECTION_THRESHOLD) return "rejected";
  if (approvals >= APPROVAL_THRESHOLD) return "approved";
  return "new";
}

export function isLocked(entry) {
  const state = catalogState(entry);
  return state === "verified" || state === "official";
}

// Whether a given user may edit this entry. Verified entries are locked to
// everyone; otherwise only the person who submitted it can change it --
// nobody edits someone else's submission in place.
export function canEdit(entry, userId) {
  if (!entry || !userId) return false;
  if (isLocked(entry)) return false;
  return entry.submittedBy === userId;
}

// A user can't approve or reject their own submission -- self-confirmation
// would let one person walk their own entry to verified.
//
// Voting also stops once an entry is settled either way. Verified is locked
// (that's what makes it terminal -- it can't later collect rejections), and
// a rejected entry is already gone.
export function canVote(entry, userId) {
  if (!entry || !userId) return false;
  if (entry.official) return false;
  if (entry.submittedBy === userId) return false;
  const state = catalogState(entry);
  if (state === "rejected" || state === "verified") return false;
  return true;
}

// How many more approvals until the next state change, for showing progress.
// Returns null once verified (nothing further to reach).
export function approvalsUntilNext(entry) {
  const state = catalogState(entry);
  const approvals = entry?.approvals ?? 0;
  if (state === "official" || state === "verified" || state === "rejected") return null;
  if (state === "new") return APPROVAL_THRESHOLD - approvals;
  return VERIFICATION_THRESHOLD - approvals;
}

export const STATE_LABELS = {
  official: "Official",
  new: "Unconfirmed",
  approved: "Community approved",
  verified: "Verified",
  rejected: "Disputed",
};

// The disclaimer shown wherever catalog specs are surfaced. Users need to
// know these numbers came from another bowler, not a manufacturer -- or,
// for official entries, that they DID come from the manufacturer and
// weren't peer-voted at all.
export function stateDescription(entry) {
  const state = catalogState(entry);
  const approvals = entry?.approvals ?? 0;
  switch (state) {
    case "official":
      return entry?.sourceNote
        ? `Manufacturer specifications. Source: ${entry.sourceNote}`
        : "Manufacturer specifications.";
    case "verified":
      return `Verified by ${approvals} bowlers. Locked from edits.`;
    case "approved":
      return `Entered by another bowler and confirmed by ${approvals}. Not manufacturer data.`;
    case "rejected":
      return "Reported as incorrect. These specs have been removed.";
    default:
      return "Entered by another bowler and not yet confirmed. Check before trusting it.";
  }
}

// What a rejected entry leaves behind: the name survives, the specs don't.
// Callers use this to clear a user's saved specs while keeping the ball in
// their arsenal.
export function clearedSpecsAfterRejection(ballName) {
  return {
    ballName,
    coverstock: "",
    coreType: "",
    weight: "",
    rg: "",
    diff: "",
    intDiff: "",
  };
}

// Balls this bowler owns whose catalog specs were rejected by the community
// AND which they haven't already acknowledged. Drives the notice telling
// them their specs were removed -- they keep the ball either way.
export function rejectedBallsFor(bowlerBalls, entriesByKey, acknowledged) {
  bowlerBalls = Array.isArray(bowlerBalls) ? bowlerBalls : [];
  const seen = new Set(acknowledged || []);
  return (bowlerBalls || []).filter(ball => {
    const key = ballKey(ball);
    if (seen.has(key)) return false;
    const entries = entriesByKey?.[key];
    if (!entries || !entries.length) return false;
    // Only notify when EVERY entry for the ball was rejected. If someone
    // else's submission survived, there are still usable specs and there's
    // nothing to warn about.
    return entries.every(e => catalogState(e) === "rejected");
  });
}

// Matching key so "Phaze II", "phaze ii", and " Phaze  II " are one ball.
export function ballKey(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Picks the entry to show for a ball when several people submitted specs.
// Verified wins outright; otherwise the most-approved; ties break toward
// the older entry, since it has had longer to be disputed.
export function bestEntry(entries) {
  entries = Array.isArray(entries) ? entries : [];
  const live = (entries || []).filter(e => catalogState(e) !== "rejected");
  if (!live.length) return null;
  return live.slice().sort((a, b) => {
    // Official outranks everything -- including verified. A manufacturer's
    // own spec sheet is more trustworthy than any number of peer votes,
    // and an official entry never accumulates approvals to compete on, so
    // without this check first it would lose to a well-voted community
    // entry purely because 0 approvals sorts below a positive count.
    const ao = a.official ? 2 : catalogState(a) === "verified" ? 1 : 0;
    const bo = b.official ? 2 : catalogState(b) === "verified" ? 1 : 0;
    if (ao !== bo) return bo - ao;
    const ad = a.approvals ?? 0;
    const bd = b.approvals ?? 0;
    if (ad !== bd) return bd - ad;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  })[0];
}

// Autocomplete over the catalog, for someone typing a ball name they
// haven't added yet. Returns one suggestion per distinct ball -- the best
// entry for each -- so a ball five people submitted appears once, not five
// times.
//
// Ranking puts prefix matches above mid-string ones ("Phaze" should surface
// "Phaze II" before "Storm Phaze"), then trusted entries above unproven
// ones, so the first suggestion is the one most likely to be right.
export function searchCatalog(query, entriesByKey, limit = 6) {
  const q = ballKey(query);
  if (q.length < 2) return [];

  const out = [];
  for (const entries of Object.values(entriesByKey || {})) {
    const best = bestEntry(entries);
    if (!best) continue;
    const key = ballKey(best.ballName);
    const idx = key.indexOf(q);
    if (idx === -1) continue;
    out.push({ entry: best, isPrefix: idx === 0 });
  }

  return out
    .sort((a, b) => {
      if (a.isPrefix !== b.isPrefix) return a.isPrefix ? -1 : 1;
      const av = catalogState(a.entry) === "verified" ? 1 : 0;
      const bv = catalogState(b.entry) === "verified" ? 1 : 0;
      if (av !== bv) return bv - av;
      const ad = a.entry.approvals ?? 0;
      const bd = b.entry.approvals ?? 0;
      if (ad !== bd) return bd - ad;
      return a.entry.ballName.localeCompare(b.entry.ballName);
    })
    .slice(0, limit)
    .map(x => x.entry);
}
