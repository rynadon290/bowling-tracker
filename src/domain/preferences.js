// User customization preferences -- which optional fields are tracked, and
// which "environment" (practice/league/tournament) the app is styled for.
//
// An environment is just a named PRESET of the individual toggles below,
// not a separate system: picking "Practice" sets trackedFields/showMoneyGames
// to sensible defaults for that context, and the person can still flip any
// individual toggle afterward. This is deliberate -- it's the same
// mechanism doing double duty, rather than two systems that could drift
// out of sync with each other.

export const ENVIRONMENTS = ["practice", "league", "tournament"];

export const TRACKED_FIELD_KEYS = ["surface", "line", "release", "miss"];

// Practice: no scoring pressure, more time between throws to enter detail --
// this is exactly when the extra diagnostic fields earn their keep.
// League/Tournament: default to the fast, simple logging flow. Tournament
// additionally hides money-game tracking, since side pots are a house-league
// convention that usually doesn't apply in tournament play.
export const ENVIRONMENT_PRESETS = {
  practice: {
    trackedFields: { surface: true, line: true, release: true, miss: true },
    showMoneyGames: false,
  },
  league: {
    trackedFields: { surface: false, line: false, release: false, miss: false },
    showMoneyGames: true,
  },
  tournament: {
    trackedFields: { surface: false, line: false, release: false, miss: false },
    showMoneyGames: false,
  },
};

function presetFor(environment) {
  return ENVIRONMENT_PRESETS[environment] || ENVIRONMENT_PRESETS.league;
}

export function defaultPreferences(environment = "league") {
  const safeEnvironment = ENVIRONMENTS.includes(environment) ? environment : "league";
  const preset = presetFor(safeEnvironment);
  return {
    environment: safeEnvironment,
    trackedFields: { ...preset.trackedFields },
    showMoneyGames: preset.showMoneyGames,
  };
}

// Normalizes whatever's stored (which may be missing keys if it predates a
// later-added toggle, or malformed) into a complete, safe preferences
// object -- so a partially-saved or out-of-date record never causes a
// missing-field crash in the UI.
export function normalizePreferences(raw) {
  const base = defaultPreferences(raw?.environment);
  if (!raw || typeof raw !== "object") return base;
  return {
    environment: ENVIRONMENTS.includes(raw.environment) ? raw.environment : base.environment,
    trackedFields: { ...base.trackedFields, ...(raw.trackedFields || {}) },
    showMoneyGames: typeof raw.showMoneyGames === "boolean" ? raw.showMoneyGames : base.showMoneyGames,
  };
}

// Switching environments is a full preset swap for trackedFields/
// showMoneyGames -- not a partial nudge -- since the whole point is "start
// fresh for this context." Anything else stored on the preferences object
// (future settings) is left untouched.
export function applyEnvironment(prefs, environment) {
  const preset = presetFor(environment);
  return {
    ...prefs,
    environment,
    trackedFields: { ...preset.trackedFields },
    showMoneyGames: preset.showMoneyGames,
  };
}

export function resetToEnvironmentDefaults(prefs) {
  return defaultPreferences(prefs.environment);
}

export function setTrackedField(prefs, field, value) {
  return { ...prefs, trackedFields: { ...prefs.trackedFields, [field]: value } };
}

export function setShowMoneyGames(prefs, value) {
  return { ...prefs, showMoneyGames: value };
}
