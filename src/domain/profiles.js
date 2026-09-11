// Bowler profiles -- attributes that belong to the PERSON rather than to a
// team, a session, or a single shot.
//
// Handedness deserves a note. It's currently stored on team_members (per
// roster slot), which means a bowler with no team has nowhere to put it,
// and a bowler on two teams could contradict themselves. The profile is
// the intended source of truth, but the roster value still exists and the
// roster UI still writes it -- so `resolveHandedness` reads the profile
// first and falls back to the roster. That keeps every existing bowler
// working unchanged while profiles get filled in over time, instead of
// requiring a risky one-shot data migration.

function numOrNull(v, min, max) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

export function emptyProfile(bowlerName = "") {
  return {
    bowlerName,
    leftHanded: false,
    twoHanded: false,
    // Whether this person coaches. Gates the coach view -- someone who
    // isn't a coach never sees coaching UI at all, rather than seeing an
    // empty version of it.
    isCoach: false,
    // Other ways this bowler's name appears on a house scoring display --
    // "R. Nadon", "RYAN N", whatever the desk typed. Used only to match a
    // scorecard photo back to the right person; never shown as their name.
    aliases: [],
    homeCenters: [],
    notes: "",
    // Book average: a static, frozen number the bowler enters and the app
    // never touches automatically. See suggestBookAverage below for the
    // end-of-season update flow.
    bookAverage: "",
    // All-time bests, so a personal-best achievement has something to
    // beat from day one. Without these, a bowler's first night would
    // either trigger a meaningless "best ever" or nothing would fire
    // until they'd logged enough for the app to work it out itself.
    allTimeHighGame: "",
    allTimeHighSeries: "",
    bookGames: "",
    bookSeason: "",
    // The end_date of the most recent league-season this bowler has
    // already been prompted about updating their book average for. Set
    // when they accept, override, or dismiss the prompt -- never touched
    // otherwise. See domain/leagueSeasons.js for how this stops the same
    // season-end from nagging twice.
    bookAverageAsOf: "",
  };
}

// Normalizes stored/partial data into a complete, safe profile. Never
// throws -- a malformed or half-written row should render, not crash.
// Trimmed, de-duplicated, case-insensitively unique. Capped because this
// is a matching aid, not a place to accumulate every typo the desk has
// ever produced.
export function normalizeAliases(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Map();
  for (const a of raw) {
    const clean = String(a ?? "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  }
  return [...seen.values()].slice(0, 8);
}

export function normalizeProfile(raw, bowlerName = "") {
  const base = emptyProfile(raw?.bowlerName || bowlerName);
  if (!raw || typeof raw !== "object") return base;
  return {
    bowlerName: raw.bowlerName || bowlerName,
    leftHanded: !!raw.leftHanded,
    twoHanded: !!raw.twoHanded,
    isCoach: !!raw.isCoach,
    aliases: normalizeAliases(raw.aliases),
    homeCenters: Array.isArray(raw.homeCenters)
      ? raw.homeCenters.filter(c => typeof c === "string" && c.trim()).map(c => c.trim())
      : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
    bookAverage: raw.bookAverage === null || raw.bookAverage === undefined ? "" : String(raw.bookAverage),
    // Listed here as well as in the empty profile: normalizeProfile
    // rebuilds the object field by field, so anything missing HERE is
    // silently dropped on every save.
    allTimeHighGame: raw.allTimeHighGame == null ? "" : String(raw.allTimeHighGame),
    allTimeHighSeries: raw.allTimeHighSeries == null ? "" : String(raw.allTimeHighSeries),
    bookGames: raw.bookGames === null || raw.bookGames === undefined ? "" : String(raw.bookGames),
    bookSeason: typeof raw.bookSeason === "string" ? raw.bookSeason : "",
    bookAverageAsOf: typeof raw.bookAverageAsOf === "string" ? raw.bookAverageAsOf : "",
  };
}

// Suggests a new book average at the end of a season, using the same rule
// USBC applies to establishing an official average: a minimum sample of
// games, and -- for a bowler across several leagues -- the better of their
// strongest single league or their combined average across all of them.
//
//   One league bowled:      that league's average, IF it has >=21 games.
//                            Fewer games -> not enough of a season to
//                            suggest anything; the old book average stays.
//   More than one league:   the higher of (a) the best average among
//                            leagues with >=21 games of their own, and
//                            (b) the composite average across every league
//                            bowled. Whichever is higher wins, matching the
//                            stated rule -- a bowler who was excellent in
//                            one league shouldn't be dragged down by a
//                            weaker one, but a bowler who split time evenly
//                            across several without any single one reaching
//                            21 games should still get a real number from
//                            their combined total.
//
// ONE ASSUMPTION MADE EXPLICIT: the composite average is held to the same
// >=21-game floor as a single league, since a suggestion from a handful of
// total games isn't a season. This wasn't stated outright; if a bowler
// splits time across three leagues at 8 games each, this returns
// ineligible rather than suggesting from 24 thin games. Flag if a
// different floor was intended for the composite case.
//
// Book average is a competitive number, not a live stat -- USBC computes
// it as total pinfall divided by games, with the remainder DROPPED, never
// rounded. A 213.9 average is a 213 book average. This function truncates
// for exactly that reason; the running averages shown elsewhere in the app
// round to one decimal because they're a different kind of number.
//
// This does its own average calculation rather than reusing seasonSummary,
// deliberately: seasonSummary rounds to one decimal for display, and
// truncating an already-rounded number compounds two different rounding
// rules. 20 games at 214 and one at 213 averages to 213.952... -- rounded
// to 213.9... no, rounded to ONE decimal that's 214.0, and truncating 214.0
// gives 214. The correct book average is 213. Truncating the raw value
// avoids that.
function rawAverage(sessions, bowler, league) {
  const games = (sessions || [])
    .filter(s => s.bowler === bowler && (!league || s.league === league))
    .flatMap(s => s.scores || [])
    .filter(v => typeof v === "number");
  if (!games.length) return { games: 0, average: null };
  return { games: games.length, average: games.reduce((a, b) => a + b, 0) / games.length };
}

const MIN_GAMES_FOR_BOOK_AVERAGE = 21;

export function suggestBookAverage(sessions, bowler) {
  sessions = Array.isArray(sessions) ? sessions : [];
  const leagues = [...new Set(
    (sessions || []).filter(s => s.bowler === bowler && s.league).map(s => s.league)
  )];

  if (leagues.length === 0) {
    return { eligible: false, suggested: null, gamesUsed: 0, basis: "no sessions logged" };
  }

  const perLeague = leagues.map(league => ({ league, ...rawAverage(sessions, bowler, league) }));

  if (leagues.length === 1) {
    const only = perLeague[0];
    if (only.games < MIN_GAMES_FOR_BOOK_AVERAGE) {
      return {
        eligible: false, suggested: null, gamesUsed: only.games,
        basis: `fewer than ${MIN_GAMES_FOR_BOOK_AVERAGE} games in ${leagues[0]}`,
      };
    }
    return {
      eligible: true, suggested: Math.trunc(only.average), gamesUsed: only.games,
      basis: `${leagues[0]} average across ${only.games} games`,
    };
  }

  const qualifying = perLeague.filter(l => l.games >= MIN_GAMES_FOR_BOOK_AVERAGE);
  const bestSingle = qualifying.length
    ? qualifying.reduce((a, b) => (b.average > a.average ? b : a))
    : null;

  const composite = rawAverage(sessions, bowler, null);
  const compositeEligible = composite.games >= MIN_GAMES_FOR_BOOK_AVERAGE ? composite : null;

  if (!bestSingle && !compositeEligible) {
    return {
      eligible: false, suggested: null, gamesUsed: composite.games,
      basis: `no league reached ${MIN_GAMES_FOR_BOOK_AVERAGE} games, and the combined total didn't either`,
    };
  }
  if (bestSingle && (!compositeEligible || bestSingle.average >= compositeEligible.average)) {
    return {
      eligible: true, suggested: Math.trunc(bestSingle.average), gamesUsed: bestSingle.games,
      basis: `${bestSingle.league} average across ${bestSingle.games} games (your strongest league)`,
    };
  }
  return {
    eligible: true, suggested: Math.trunc(compositeEligible.average), gamesUsed: compositeEligible.games,
    basis: `combined average across all ${leagues.length} leagues, ${compositeEligible.games} games`,
  };
}

// Profile wins; roster is the fallback for bowlers whose profile hasn't
// been filled in yet. Returns false (right-handed) when neither knows,
// since that's the safe default for the 10-pin/7-pin chip labels.
export function resolveHandedness(profile, rosterLeftHanded) {
  if (profile && typeof profile.leftHanded === "boolean" && profile.bowlerName) {
    return profile.leftHanded;
  }
  return !!rosterLeftHanded;
}

// Home centers are stored as shared bowling_centers ids, so a bowler's home
// house is the same row every other bowler references -- which is what makes
// per-center stats aggregate instead of fragmenting across spellings.
export function addHomeCenter(profile, centerId) {
  const id = (centerId || "").trim();
  if (!id) return profile;
  const existing = profile.homeCenters || [];
  if (existing.includes(id)) return profile;
  return { ...profile, homeCenters: [...existing, id] };
}

// Turns the stored ids into center objects for rendering. An id with no
// matching center (deleted, or centers not loaded yet) is dropped rather
// than rendered as a raw uuid.
export function resolveHomeCenters(profile, centers) {
  const byId = {};
  (centers || []).forEach(c => { byId[c.id] = c; });
  return (profile?.homeCenters || [])
    .map(id => byId[id])
    .filter(Boolean);
}

export function hasHomeCenter(profile, centerId) {
  return (profile?.homeCenters || []).includes(centerId);
}

export function removeHomeCenter(profile, center) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return profile;
  return {
    ...profile,
    homeCenters: (profile.homeCenters || []).filter(c => c !== center),
  };
}

export function setProfileField(profile, field, value) {
  return { ...profile, [field]: value };
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function profileToRow(profile, userId) {
  profile = profile && typeof profile === "object" ? profile : {};
  return {
    created_by: userId,
    bowler_name: profile.bowlerName,
    left_handed: !!profile.leftHanded,
    two_handed: !!profile.twoHanded,
    is_coach: !!profile.isCoach,
    aliases: (profile.aliases && profile.aliases.length) ? profile.aliases : null,
    home_centers: profile.homeCenters || [],
    notes: profile.notes || null,
    // Guard against undefined as well as "" -- a profile object built
    // before these fields existed has neither, and Number(undefined) is
    // NaN, which Postgres rejects.
    book_average: numOrNull(profile.bookAverage, 0, 300),
    all_time_high_game: numOrNull(profile.allTimeHighGame, 0, 300),
    all_time_high_series: numOrNull(profile.allTimeHighSeries, 0, 900),
    book_games: (() => { const n = numOrNull(profile.bookGames, 1, 10000); return n === null ? null : Math.round(n); })(),
    book_season: profile.bookSeason || null,
    book_average_as_of: profile.bookAverageAsOf || null,
    updated_at: new Date().toISOString(),
  };
}

export function profileFromRow(row) {
  if (!row) return null;
  return normalizeProfile({
    bowlerName: row.bowler_name || "",
    leftHanded: !!row.left_handed,
    twoHanded: !!row.two_handed,
    isCoach: !!row.is_coach,
    aliases: row.aliases,
    homeCenters: row.home_centers || [],
    notes: row.notes || "",
    bookAverage: row.book_average,
    allTimeHighGame: row.all_time_high_game,
    allTimeHighSeries: row.all_time_high_series,
    bookGames: row.book_games,
    bookSeason: row.book_season,
    bookAverageAsOf: row.book_average_as_of,
  });
}

// ── Derived membership ──────────────────────────────────────────────────
// Team and league membership aren't stored on the profile -- they're
// already the roster's job, and duplicating them would let the two drift
// apart. This derives them from the teams the app already has.
export function membershipFor(bowlerName, teams) {
  const list = Array.isArray(teams) ? teams : [];
  const onTeams = list.filter(t => (t.members || []).includes(bowlerName));
  const leagues = [...new Set(onTeams.map(t => t.league).filter(Boolean))];
  return {
    teams: onTeams.map(t => ({ id: t.id, name: t.name, league: t.league || "" })),
    leagues,
  };
}
