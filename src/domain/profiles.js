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

export function emptyProfile(bowlerName = "") {
  return {
    bowlerName,
    leftHanded: false,
    twoHanded: false,
    homeCenters: [],
    notes: "",
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
