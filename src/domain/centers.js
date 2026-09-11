// Bowling centers.
//
// Attached to leagues rather than sessions -- a league bowls at one house
// for a season, so it's one entry per season instead of a tap every night.
//
// The point of recording them isn't the address; it's being able to say
// "you average 12 pins higher at Arsenal Bowl than at Bowlero." Everything
// here exists to make centers resolve to ONE identity so those stats
// aggregate correctly.

export function emptyCenter() {
  return {
    id: "",
    hereId: null,
    name: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    lat: null,
    lng: null,
  };
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function normalizeCenter(raw) {
  const base = emptyCenter();
  if (!raw || typeof raw !== "object") return base;
  return {
    id: raw.id || "",
    hereId: raw.hereId || null,
    name: (raw.name || "").trim(),
    address: raw.address || "",
    city: raw.city || "",
    state: raw.state || "",
    postalCode: raw.postalCode || "",
    country: raw.country || "",
    lat: numOrNull(raw.lat),
    lng: numOrNull(raw.lng),
  };
}

// A short label for lists: "Arsenal Bowl · Pittsburgh, PA".
// Falls back gracefully when a hand-entered center has no city.
export function centerLabel(center) {
  if (!center?.name) return "";
  const place = [center.city, center.state].filter(Boolean).join(", ");
  return place ? `${center.name} · ${place}` : center.name;
}

// Distance in whole miles, for showing how far a search result is.
// HERE returns metres; null means the search wasn't location-anchored.
export function distanceMiles(metres) {
  if (typeof metres !== "number") return null;
  return Math.round((metres / 1609.34) * 10) / 10;
}

// Matching key for centers with no HERE id -- hand-entered ones. Name plus
// city, normalized, so "Arsenal Bowl" and " arsenal  bowl " in the same
// city are recognized as one house rather than splitting its stats.
export function centerKey(center) {
  const name = (center?.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const city = (center?.city || "").trim().toLowerCase();
  return city ? `${name}|${city}` : name;
}

// Finds an existing center matching a search result, so picking the same
// venue twice doesn't create a duplicate row. HERE id is authoritative when
// both sides have one; otherwise fall back to name+city.
export function findExistingCenter(candidate, centers) {
  const list = Array.isArray(centers) ? centers : [];
  if (candidate?.hereId) {
    const byId = list.find(c => c.hereId && c.hereId === candidate.hereId);
    if (byId) return byId;
  }
  const key = centerKey(candidate);
  return list.find(c => centerKey(c) === key) || null;
}

// ── Per-center stats ────────────────────────────────────────────────────
// The actual payoff: how a bowler performs house to house.
//
// Sessions don't store a center directly -- they store a league, and the
// league points at a center. So this resolves through the league, which
// also means a league that hasn't set its center yet is simply excluded
// rather than lumped into a fake "unknown" bucket.
export function statsByCenter(sessions, leagues, centers, bowler) {
  sessions = Array.isArray(sessions) ? sessions : [];
  const centerByLeague = {};
  (leagues || []).forEach(l => {
    if (l.centerId) centerByLeague[l.name] = l.centerId;
  });
  const centerById = {};
  (centers || []).forEach(c => { centerById[c.id] = c; });

  const buckets = {};
  (sessions || [])
    .filter(s => !bowler || s.bowler === bowler)
    .forEach(session => {
      const centerId = centerByLeague[session.league];
      if (!centerId) return;
      const b = buckets[centerId] = buckets[centerId] || { games: [], sessions: 0 };
      b.sessions += 1;
      (session.scores || []).forEach(sc => {
        if (typeof sc === "number") b.games.push(sc);
      });
    });

  return Object.entries(buckets)
    .map(([centerId, b]) => ({
      center: centerById[centerId] || null,
      centerId,
      sessions: b.sessions,
      games: b.games.length,
      average: b.games.length
        ? Math.round((b.games.reduce((x, y) => x + y, 0) / b.games.length) * 10) / 10
        : null,
      high: b.games.length ? Math.max(...b.games) : null,
    }))
    .filter(s => s.center && s.games > 0)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function centerToRow(center, userId) {
  return {
    id: center.id,
    here_id: center.hereId || null,
    name: center.name,
    address: center.address || null,
    city: center.city || null,
    state: center.state || null,
    postal_code: center.postalCode || null,
    country: center.country || null,
    lat: center.lat,
    lng: center.lng,
    created_by: userId || null,
  };
}

export function centerFromRow(row) {
  if (!row) return null;
  return normalizeCenter({
    id: row.id,
    hereId: row.here_id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
  });
}
