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
    homeCenters: [],
    notes: "",
    // Book average seed -- see blendedAverage below.
    bookAverage: "",
    bookGames: "",
    bookSeason: "",
  };
}

// Normalizes stored/partial data into a complete, safe profile. Never
// throws -- a malformed or half-written row should render, not crash.
export function normalizeProfile(raw, bowlerName = "") {
  const base = emptyProfile(raw?.bowlerName || bowlerName);
  if (!raw || typeof raw !== "object") return base;
  return {
    bowlerName: raw.bowlerName || bowlerName,
    leftHanded: !!raw.leftHanded,
    twoHanded: !!raw.twoHanded,
    homeCenters: Array.isArray(raw.homeCenters)
      ? raw.homeCenters.filter(c => typeof c === "string" && c.trim()).map(c => c.trim())
      : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
    bookAverage: raw.bookAverage === null || raw.bookAverage === undefined ? "" : String(raw.bookAverage),
    bookGames: raw.bookGames === null || raw.bookGames === undefined ? "" : String(raw.bookGames),
    bookSeason: typeof raw.bookSeason === "string" ? raw.bookSeason : "",
  };
}

// The average to show, blending a book average with logged games.
//
// A book average is real data from a lot of games -- usually 60-100 -- so
// it shouldn't vanish the moment three nights are logged, and three nights
// shouldn't be treated as equal to a whole season. Weighted by game count
// on each side: (book * bookGames + logged * loggedGames) / total. As
// logged games accumulate the book naturally fades out.
//
// Returns null with no data at all; returns the book alone with no logged
// games; ignores the book if it's blank or nonsensical.
export function blendedAverage(profile, loggedGames) {
  const games = (loggedGames || []).filter(g => typeof g === "number");
  const book = Number(profile?.bookAverage);
  const bookN = Math.round(Number(profile?.bookGames));
  const bookValid = Number.isFinite(book) && book >= 0 && book <= 300 && Number.isFinite(bookN) && bookN > 0;

  if (!games.length && !bookValid) return null;
  if (!games.length) return { average: Math.round(book * 10) / 10, source: "book", loggedGames: 0, bookGames: bookN };

  const loggedSum = games.reduce((a, b) => a + b, 0);
  if (!bookValid) {
    return { average: Math.round((loggedSum / games.length) * 10) / 10, source: "logged", loggedGames: games.length, bookGames: 0 };
  }
  const blended = (book * bookN + loggedSum) / (bookN + games.length);
  return {
    average: Math.round(blended * 10) / 10,
    source: "blended",
    loggedGames: games.length,
    bookGames: bookN,
    loggedOnly: Math.round((loggedSum / games.length) * 10) / 10,
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
  return {
    created_by: userId,
    bowler_name: profile.bowlerName,
    left_handed: !!profile.leftHanded,
    two_handed: !!profile.twoHanded,
    home_centers: profile.homeCenters || [],
    notes: profile.notes || null,
    // Guard against undefined as well as "" -- a profile object built
    // before these fields existed has neither, and Number(undefined) is
    // NaN, which Postgres rejects.
    book_average: numOrNull(profile.bookAverage, 0, 300),
    book_games: (() => { const n = numOrNull(profile.bookGames, 1, 10000); return n === null ? null : Math.round(n); })(),
    book_season: profile.bookSeason || null,
    updated_at: new Date().toISOString(),
  };
}

export function profileFromRow(row) {
  if (!row) return null;
  return normalizeProfile({
    bowlerName: row.bowler_name || "",
    leftHanded: !!row.left_handed,
    twoHanded: !!row.two_handed,
    homeCenters: row.home_centers || [],
    notes: row.notes || "",
    bookAverage: row.book_average,
    bookGames: row.book_games,
    bookSeason: row.book_season,
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
