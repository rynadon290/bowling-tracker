// Verification of imported scores.
//
// One person photographs the scorecard; everyone on the team gets their
// scores from it. The problem that creates is consent: writing to someone
// else's record on a teammate's say-so is not acceptable, but neither is
// blocking the whole team until every member logs in and taps approve.
//
// The rule set this implements:
//
//   - Imported scores are USED immediately, by everyone, while pending.
//     A team's numbers shouldn't sit broken waiting on the one member who
//     bowls and goes home.
//   - The bowler approves    -> verified, nothing further.
//   - The bowler ignores it  -> the import stands. Silence is acceptance,
//                               because the alternative is a team average
//                               that never resolves.
//   - The bowler rejects it with corrected scores -> corrections are used.
//   - The bowler rejects it with no corrections   -> the scores are
//     withdrawn and someone re-enters them through the normal
//     document-for-another-bowler flow. A rejected number is not a
//     number; it must not keep counting.
//   - The scores are wrong and the bowler says nothing before the next
//     session ends -> a teammate whose OWN scores for that session are
//     verified may correct them. Narrow on purpose: it takes someone with
//     skin in the game, and only once the bowler has had a full session
//     to speak up.

export const IMPORT_STATUSES = ["pending", "verified", "corrected", "rejected"];

// What a status means for whether the numbers count.
//
// pending counts (silence is acceptance), rejected does not (a withdrawn
// number is not data). This single function is why "assumed correct after
// no response" needs no timer: pending already counts, so nothing has to
// flip for the assumption to hold.
export function scoresCount(status) {
  return status !== "rejected";
}

export function emptyImportRecord(bowler, uploadedBy) {
  return {
    id: "",
    bowler,
    uploadedBy,
    league: "",
    date: "",
    // As read off the scorecard.
    importedScores: [],
    // Supplied by the bowler (or a teammate correcting) when the import
    // was wrong. Null means "no correction offered".
    correctedScores: null,
    status: "pending",
    respondedAt: "",
    correctedBy: "",
    note: "",
  };
}

function cleanScores(raw) {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .map(v => (v === "" || v === null || v === undefined ? null : Number(v)))
    .map(v => (Number.isFinite(v) && v >= 0 && v <= 300 ? Math.round(v) : null));
  return out.some(v => v !== null) ? out : null;
}

export function normalizeImportRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bowler = String(raw.bowler ?? "").trim();
  if (!bowler) return null;
  return {
    id: raw.id || "",
    bowler,
    uploadedBy: String(raw.uploadedBy ?? "").trim(),
    league: raw.league || "",
    date: raw.date || "",
    importedScores: cleanScores(raw.importedScores) || [],
    correctedScores: cleanScores(raw.correctedScores),
    // Proposed frame data, when the scorecard had frames to read. Kept
    // as-is rather than cleaned like scores: these are shot objects, and
    // the only meaningful validation is whether they convert to real
    // frames, which convertExtractedGameToShots already did upstream.
    importedShots: Array.isArray(raw.importedShots) ? raw.importedShots : [],
    correctedShots: Array.isArray(raw.correctedShots) ? raw.correctedShots : null,
    status: IMPORT_STATUSES.includes(raw.status) ? raw.status : "pending",
    respondedAt: raw.respondedAt || "",
    correctedBy: raw.correctedBy || "",
    note: (raw.note || "").trim(),
  };
}

// The scores everyone should actually see and use, right now.
//
// Returns null when the record is rejected without corrections -- the
// caller must render "needs re-entry", NOT fall back to the numbers the
// bowler just told us were wrong.
export function effectiveScores(record) {
  const r = normalizeImportRecord(record);
  if (!r) return null;
  if (r.status === "rejected") return null;
  if (r.status === "corrected" && r.correctedScores) return r.correctedScores;
  return r.importedScores.length ? r.importedScores : null;
}

// Whether the numbers on screen have actually been confirmed by the
// person they belong to. Pending scores count, but should be labelled --
// "counting, unconfirmed" is honest; showing them as settled is not.
export function isConfirmed(record) {
  const r = normalizeImportRecord(record);
  return !!r && (r.status === "verified" || r.status === "corrected");
}

// ── Bowler responses ────────────────────────────────────────────────────

export function approve(record, at = new Date().toISOString()) {
  const r = normalizeImportRecord(record);
  // correctedShots is left as-is rather than nulled alongside
  // correctedScores: approving means "these frames are right", and the
  // corrected set (if the teammate edited any) IS the right one.
  return { ...r, status: "verified", respondedAt: at, correctedScores: null };
}

// Rejecting WITH corrections replaces the numbers; rejecting without them
// withdraws the import entirely.
export function reject(record, correctedScores = null, { by = "", note = "", at = new Date().toISOString() } = {}) {
  const r = normalizeImportRecord(record);
  const corrected = cleanScores(correctedScores);
  if (corrected) {
    return { ...r, status: "corrected", correctedScores: corrected, respondedAt: at, correctedBy: by || r.bowler, note };
  }
  return { ...r, status: "rejected", correctedScores: null, respondedAt: at, note };
}

// ── Teammate corrections ────────────────────────────────────────────────

// Has a later session for this league finished? The bowler's window to
// speak for themselves is one full session, not a clock -- league bowlers
// think in nights, and a wall-clock deadline would expire over a holiday
// break when nobody was bowling at all.
export function laterSessionEnded(record, sessions, today = new Date()) {
  const r = normalizeImportRecord(record);
  if (!r) return false;
  const todayStr = today.toISOString().slice(0, 10);
  return (Array.isArray(sessions) ? sessions : []).some(s =>
    s && s.league === r.league && s.date > r.date && s.date <= todayStr);
}

// Whether `actor` may correct this record right now.
//
// Deliberately restrictive. Order matters: a bowler may always fix their
// own scores, and everything below that is the exception path for when
// they have gone quiet.
export function canCorrect(record, actor, opts) {
  // A default parameter applies to undefined, not null -- and a caller
  // reading options from state will naturally pass null before they
  // load.
  const { sessions = [], verifiedTeammates = [], today = new Date() } =
    (opts && typeof opts === "object") ? opts : {};
  const r = normalizeImportRecord(record);
  if (!r || !actor) return { allowed: false, reason: "no record" };

  // Your own scores, always.
  if (actor === r.bowler) return { allowed: true, reason: "own scores" };

  // Already settled by the person it belongs to -- a teammate does not
  // get to overrule them.
  if (r.status === "verified" || r.status === "corrected") {
    return { allowed: false, reason: "the bowler has already responded" };
  }

  // The correcting teammate must have skin in the game: their own scores
  // for this session must be confirmed.
  if (!verifiedTeammates.includes(actor)) {
    return { allowed: false, reason: "only a teammate with verified scores of their own can correct this" };
  }

  // And the bowler must have had a full session to speak up.
  if (!laterSessionEnded(r, sessions, today)) {
    return { allowed: false, reason: "wait until the next session has finished" };
  }

  return { allowed: true, reason: "bowler did not respond before the next session ended" };
}

export function correctAsTeammate(record, correctedScores, actor, opts = {}) {
  const permission = canCorrect(record, actor, opts);
  if (!permission.allowed) return { record: normalizeImportRecord(record), error: permission.reason };
  const corrected = cleanScores(correctedScores);
  if (!corrected) return { record: normalizeImportRecord(record), error: "no corrected scores supplied" };
  return {
    record: {
      ...normalizeImportRecord(record),
      status: "corrected",
      correctedScores: corrected,
      correctedBy: actor,
      respondedAt: opts.at || new Date().toISOString(),
    },
    error: null,
  };
}

// ── For the UI ──────────────────────────────────────────────────────────

// One line describing where a record stands, in the bowler's terms.
export function describeStatus(record) {
  const r = normalizeImportRecord(record);
  if (!r) return "";
  if (r.status === "verified") return "Confirmed by the bowler.";
  if (r.status === "corrected") {
    return r.correctedBy && r.correctedBy !== r.bowler
      ? `Corrected by ${r.correctedBy}.`
      : "Corrected by the bowler.";
  }
  if (r.status === "rejected") return "Rejected — these scores need to be entered again.";
  return "From an imported scorecard, not yet confirmed.";
}

// Records awaiting a given bowler's response.
export function pendingFor(records, bowler) {
  return (Array.isArray(records) ? records : [])
    .map(normalizeImportRecord)
    .filter(r => r && r.bowler === bowler && r.status === "pending");
}

// Records that need someone to re-enter them, because the bowler rejected
// without supplying corrections.
export function needingReentry(records) {
  return (Array.isArray(records) ? records : [])
    .map(normalizeImportRecord)
    .filter(r => r && r.status === "rejected");
}

// A game score that a game of bowling can actually produce.
//
// The teammate review screen used to accept any positive number, so a
// garbled OCR read -- 1.95e+127 was a real one -- displayed as a valid
// series, passed review, and was then silently nulled by cleanScores on
// the receiving end. The teammate got a blank score and no explanation,
// and the uploader had no idea anything was wrong.
//
// 300 is the hard ceiling: no game can exceed it. Empty is allowed --
// "this bowler didn't bowl game 3" is a real answer, distinct from a
// misread.
export function isValidGameScore(v) {
  if (v === "" || v === null || v === undefined) return true;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 300;
}

// Which entries in a teammate's score row are unusable, so the UI can
// point at them instead of letting them through.
export function invalidScoreIndexes(scores) {
  return (Array.isArray(scores) ? scores : [])
    .map((v, i) => (isValidGameScore(v) ? -1 : i))
    .filter(i => i >= 0);
}
