// Manually-entered game scores.
//
// The app was built shot-first: every score is computed from logged shots.
// That's the richer path, but it excludes two real cases -- a screenshot
// that only shows game totals, and bowlers who want score tracking without
// logging 30 shots a night. This lets a score exist on its own.
//
// PRECEDENCE: a manual score wins over a shot-derived one. If someone typed
// a number, they know something the shot data doesn't -- usually that the
// shot data is incomplete. Silently preferring a partial computed score
// over the number the bowler actually shot would be worse than useless.

const KEY_SEP = "|";

export function scoreKey(bowler, league, date, game) {
  return [bowler, league, date, String(game)].join(KEY_SEP);
}

export function normalizeManualScores(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    // A score of 0 is legitimate (a forfeit or an all-gutter game), so the
    // guard is on validity and range, not truthiness.
    if (!Number.isNaN(n) && n >= 0 && n <= 300) out[k] = Math.round(n);
  }
  return out;
}

export function setManualScore(scores, bowler, league, date, game, value) {
  const key = scoreKey(bowler, league, date, game);
  const next = { ...scores };
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (raw === "") {
    delete next[key];
    return next;
  }
  // Number("  ") is 0, so a stray space would silently record a 0 game
  // and tank the average. Trim first and treat blank as "clear", never as
  // zero. Round BEFORE the range check so "300.4" lands as 300 rather
  // than being rejected for exceeding 300.
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 300) return scores;
  next[key] = n;
  return next;
}

export function getManualScore(scores, bowler, league, date, game) {
  const v = scores?.[scoreKey(bowler, league, date, game)];
  return v === undefined ? null : v;
}

// The score to actually use: manual if present, otherwise whatever the
// shots computed to (which may itself be null for an incomplete game).
export function resolveGameScore(manualScores, bowler, league, date, game, shotDerived) {
  const manual = getManualScore(manualScores, bowler, league, date, game);
  return manual !== null ? manual : shotDerived;
}

// Sums whatever games have a score, so the person never types a total.
// Returns null when nothing is entered at all -- distinct from 0, which
// would be a real (if grim) series.
export function seriesTotal(gameScores) {
  const valid = (gameScores || []).filter(v => typeof v === "number");
  return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
}

export function seriesAverage(gameScores) {
  const valid = (gameScores || []).filter(v => typeof v === "number");
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// True when this night's scores came from manual entry rather than shots.
// The UI uses this to explain why per-shot stats are unavailable, instead
// of showing empty charts with no reason given.
export function isManualNight(manualScores, bowler, league, date, gameCount = 3) {
  for (let g = 1; g <= gameCount; g++) {
    if (getManualScore(manualScores, bowler, league, date, g) !== null) return true;
  }
  return false;
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function manualScoreToRow(bowler, leagueId, date, game, score, userId) {
  return {
    user_id: userId,
    bowler_name: bowler,
    league_id: leagueId,
    date,
    game,
    score,
  };
}

export function manualScoresFromRows(rows, leagueNameById) {
  const out = {};
  for (const row of rows || []) {
    const leagueName = leagueNameById?.[row.league_id] || "";
    out[scoreKey(row.bowler_name, leagueName, row.date, row.game)] = row.score;
  }
  return out;
}
