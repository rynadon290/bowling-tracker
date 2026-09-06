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

// Stats cards the person can reorder or hide. Order here is the default
// order; anything not listed in a stored preference falls back to this,
// so adding a new card later doesn't require migrating anyone's saved
// layout -- it just appears at its default position.
//
// `fixed: true` marks cards that stay put regardless of ordering. "Viewing"
// is the bowler/league selector that controls everything below it, and
// "Danger Zone" is destructive actions -- both would be confusing or
// hazardous to relocate into the middle of the stats.
export const STATS_CARDS = [
  { id: "viewing", label: "Viewing", fixed: true },
  { id: "headToHead", label: "Head-to-Head" },
  { id: "teamRecords", label: "Team Records" },
  { id: "seasonRecord", label: "Season Record" },
  { id: "weeklyPoints", label: "Weekly Points" },
  { id: "handicapImpact", label: "Handicap Impact" },
  { id: "teamLeaderboard", label: "Team Leaderboard" },
  { id: "giantKiller", label: "Giant Killer" },
  { id: "hung", label: "Hung" },
  { id: "teamSeries", label: "Team Series" },
  { id: "headlineStats", label: "Shots / Strike % / Spare %" },
  { id: "cleanFrames", label: "Clean Frames" },
  { id: "framePosition", label: "Frame Position" },
  { id: "firstBallAverage", label: "First-Ball Average" },
  { id: "tenPinLeaves", label: "Ten Pin Leaves" },
  { id: "singlePinSpares", label: "Single Pin Spares" },
  { id: "splits", label: "Splits" },
  { id: "loneFivePin", label: "Lone 5-Pin" },
  { id: "nonSplitLeaves", label: "Non-Split Leaves" },
  { id: "strikeStreak", label: "Longest Strike Streak" },
  { id: "byBall", label: "By Ball" },
  { id: "missDistribution", label: "Miss Distribution" },
  { id: "releaseQuality", label: "Release Quality" },
  { id: "ballChangeTriggers", label: "Ball Change Triggers" },
  { id: "strikeQuality", label: "Strike Quality" },
  { id: "runningAverages", label: "Running Averages" },
  { id: "theoreticalAverage", label: "Theoretical Average" },
  { id: "progress", label: "Progress to Next Milestone" },
  { id: "consistency", label: "Score Consistency" },
  { id: "scoreDistribution", label: "Score Distribution" },
  { id: "gameByGame", label: "Game-by-Game Averages" },
  { id: "trend", label: "Trend" },
  { id: "money", label: "Money Games" },
  { id: "threeSixNine", label: "3-6-9 Tracker" },
  { id: "sessionHistory", label: "Session History" },
  { id: "dangerZone", label: "Danger Zone", fixed: true },
];

export const STATS_CARD_IDS = STATS_CARDS.map(c => c.id);

// Only these can be reordered or hidden by the person.
export const MOVABLE_STATS_CARDS = STATS_CARDS.filter(c => !c.fixed);
export const MOVABLE_STATS_CARD_IDS = MOVABLE_STATS_CARDS.map(c => c.id);

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
    statsCardOrder: [...MOVABLE_STATS_CARD_IDS],
    hiddenStatsCards: [],
  };
}

// Reconciles a stored card order against the CURRENT set of known cards.
// Two things have to hold: ids that no longer exist get dropped (a removed
// card shouldn't leave a hole), and cards added since the order was saved
// get appended rather than disappearing -- otherwise shipping a new stats
// card would make it invisible to every existing user.
export function reconcileCardOrder(storedOrder) {
  const stored = Array.isArray(storedOrder) ? storedOrder : [];
  const known = stored.filter(id => MOVABLE_STATS_CARD_IDS.includes(id));
  const seen = new Set(known);
  const missing = MOVABLE_STATS_CARD_IDS.filter(id => !seen.has(id));
  return [...known, ...missing];
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
    statsCardOrder: reconcileCardOrder(raw.statsCardOrder),
    hiddenStatsCards: Array.isArray(raw.hiddenStatsCards)
      ? raw.hiddenStatsCards.filter(id => MOVABLE_STATS_CARD_IDS.includes(id))
      : [],
  };
}

// Moves a card up or down by one position. Out-of-range moves are no-ops
// rather than errors, so the UI can render the buttons unconditionally.
export function moveStatsCard(prefs, cardId, direction) {
  const order = reconcileCardOrder(prefs.statsCardOrder);
  const from = order.indexOf(cardId);
  if (from === -1) return prefs;
  const to = from + (direction === "up" ? -1 : 1);
  if (to < 0 || to >= order.length) return prefs;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return { ...prefs, statsCardOrder: next };
}

export function toggleStatsCardHidden(prefs, cardId) {
  const hidden = Array.isArray(prefs.hiddenStatsCards) ? prefs.hiddenStatsCards : [];
  const next = hidden.includes(cardId)
    ? hidden.filter(id => id !== cardId)
    : [...hidden, cardId];
  return { ...prefs, hiddenStatsCards: next };
}

// The order to actually render, with hidden cards removed.
export function visibleStatsCardOrder(prefs) {
  const hidden = new Set(Array.isArray(prefs?.hiddenStatsCards) ? prefs.hiddenStatsCards : []);
  return reconcileCardOrder(prefs?.statsCardOrder).filter(id => !hidden.has(id));
}

// Switching environments is a full preset swap for trackedFields/
// showMoneyGames -- not a partial nudge -- since the whole point is "start
// fresh for this context." Anything else stored on the preferences object
// (future settings) is left untouched.
export function applyEnvironment(prefs, environment) {
  const safeEnvironment = ENVIRONMENTS.includes(environment) ? environment : "league";
  const preset = presetFor(safeEnvironment);
  return {
    ...prefs,
    environment: safeEnvironment,
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
