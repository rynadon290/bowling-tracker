// Matching a name off a scorecard photo to a bowler in the app.
//
// The house display shows whatever the desk typed: "R. Nadon", "RYAN",
// "Ryan N", sometimes a nickname that appears nowhere in the app. Getting
// this wrong writes one bowler's 250 into another bowler's record, which
// is worse than not importing at all -- a missing game is noticed, a
// wrong one silently corrupts an average.
//
// So this never decides. It RANKS, with an explicit confidence, and the
// import flow makes the user confirm. Aliases (see normalizeAliases in
// profiles.js) exist precisely because the desk's spelling is not the
// bowler's problem to live with.

// Comparison form: case-folded, punctuation dropped, whitespace collapsed.
// "R. Nadon" and "r nadon" must land on the same string.
export function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.,'"`\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Ryan Nadon" -> { first: "ryan", last: "nadon", initial: "r" }
function parts(name) {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  if (!tokens.length) return { first: "", last: "", initial: "", tokens };
  return {
    first: tokens[0],
    last: tokens.length > 1 ? tokens[tokens.length - 1] : "",
    initial: tokens[0][0] || "",
    tokens,
  };
}

// Scored 0-1. Deliberately a small set of explainable rules rather than a
// fuzzy string distance: "Ryan" vs "Bryan" is one edit apart and a
// completely different bowler, and an import that silently prefers
// near-misses is how the corruption above happens.
export function nameScore(scorecardName, candidateName) {
  const a = normalizeName(scorecardName);
  const b = normalizeName(candidateName);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const pa = parts(a);
  const pb = parts(b);

  // "R Nadon" vs "Ryan Nadon" -- initial plus a matching surname is the
  // single most common house-display shorthand.
  if (pa.last && pa.last === pb.last) {
    if (pa.first === pb.first) return 1;
    if (pa.first.length === 1 && pa.first === pb.initial) return 0.9;
    if (pb.first.length === 1 && pb.first === pa.initial) return 0.9;
    // Same surname, different first name -- could easily be two family
    // members on the same team, which is common in league bowling.
    return 0.5;
  }

  // "Ryan N" vs "Ryan Nadon": first names match, surname abbreviated.
  if (pa.first && pa.first === pb.first) {
    if (!pa.last || !pb.last) return 0.8;
    if (pa.last.length === 1 && pb.last.startsWith(pa.last)) return 0.85;
    if (pb.last.length === 1 && pa.last.startsWith(pb.last)) return 0.85;
    return 0.6;
  }

  // One is contained in the other ("ryan" in "ryan nadon jr").
  if (a.includes(b) || b.includes(a)) return 0.7;

  return 0;
}

// Best score across a bowler's own name and every alias they've recorded.
export function bestNameScore(scorecardName, bowlerName, aliases = []) {
  const candidates = [bowlerName, ...(Array.isArray(aliases) ? aliases : [])];
  let best = 0;
  let via = null;
  for (const c of candidates) {
    const score = nameScore(scorecardName, c);
    if (score > best) { best = score; via = c; }
  }
  return { score: best, via };
}

// A match is only auto-applied at or above this. Anything below is shown
// for confirmation instead. An exact name or alias hit clears it; a
// shared surname alone does not.
export const AUTO_MATCH_SCORE = 0.85;

// Ranks every roster bowler against one scorecard name.
//
// `roster` is [{ bowler, aliases, lineupPosition }]. lineupPosition is
// used only to break ties between equally-good name matches -- never to
// override a name. A roster typed in the wrong order would otherwise
// silently reassign everyone's scores, which is exactly the failure the
// confirmation step exists to catch.
export function matchBowler(scorecardName, roster, { columnIndex = null } = {}) {
  const ranked = (Array.isArray(roster) ? roster : [])
    .map(r => {
      const { score, via } = bestNameScore(scorecardName, r.bowler, r.aliases);
      return {
        bowler: r.bowler,
        score,
        matchedVia: via,
        // Flagged, not scored: it corroborates a name match, it does not
        // make one.
        positionAgrees: columnIndex != null && r.lineupPosition === columnIndex,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.positionAgrees !== b.positionAgrees) return a.positionAgrees ? -1 : 1;
      return a.bowler.localeCompare(b.bowler);
    });

  const best = ranked[0];
  const runnerUp = ranked[1];
  // Ambiguous when two candidates score the same -- two brothers on one
  // team, for instance. Never auto-apply in that case regardless of how
  // high the score is.
  const ambiguous = !!(best && runnerUp && runnerUp.score === best.score && best.score > 0);

  return {
    ranked,
    best: best && best.score > 0 ? best : null,
    ambiguous,
    autoMatch: !!(best && best.score >= AUTO_MATCH_SCORE && !ambiguous),
  };
}

// Matches a whole scorecard at once, left to right.
//
// Assigns greedily by confidence rather than column order, so one
// confidently-matched name can't be stolen by an earlier column that only
// weakly matched the same bowler. Nothing is auto-assigned twice.
export function matchScorecard(columns, roster) {
  const cols = (Array.isArray(columns) ? columns : []).map((c, i) => ({
    columnIndex: i,
    scorecardName: typeof c === "string" ? c : c?.name ?? "",
    ...(typeof c === "object" && c ? c : {}),
  }));

  const results = cols.map(c => ({
    ...c,
    ...matchBowler(c.scorecardName, roster, { columnIndex: c.columnIndex }),
    assigned: null,
  }));

  const taken = new Set();
  for (const r of [...results].sort((a, b) => (b.best?.score ?? 0) - (a.best?.score ?? 0))) {
    if (!r.autoMatch) continue;
    if (taken.has(r.best.bowler)) {
      // Someone else matched this bowler more confidently -- fall back to
      // asking rather than picking a loser.
      r.autoMatch = false;
      continue;
    }
    r.assigned = r.best.bowler;
    taken.add(r.best.bowler);
  }

  return {
    columns: results,
    // The whole import needs confirmation unless every column landed on
    // its own bowler unambiguously.
    needsReview: results.some(r => !r.assigned),
    unmatched: results.filter(r => !r.assigned).map(r => r.scorecardName),
  };
}
