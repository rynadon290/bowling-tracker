// User customization preferences -- which optional fields are tracked, and
// which "environment" (practice/league/tournament) the app is styled for.
//
// An environment is just a named PRESET of the individual toggles below,
// not a separate system: picking "Practice" sets trackedFields/showMoneyGames
// to sensible defaults for that context, and the person can still flip any
// individual toggle afterward. This is deliberate -- it's the same
// mechanism doing double duty, rather than two systems that could drift
// out of sync with each other.

// "casual" is the fourth: bowling with friends or the kids, where nothing
// but the score matters. It exists for the league bowler's off night, not
// as a bid for the party-bowling market -- it just hides the depth.
export const ENVIRONMENTS = ["practice", "league", "tournament", "casual"];

// revRate and axisRotation are self-reported estimates -- a bowler has no
// way to measure them without a sensor -- and are labelled as such in the
// UI. Off everywhere by default; the bowlers who want them will find them.
export const TRACKED_FIELD_KEYS = ["surface", "line", "release", "miss", "ballSpeed", "shoes", "revRate", "axisRotation"];

// How much detail the person wants to log. "shot" is the full frame-by-frame
// flow the app was built around; "game" is just final scores per game, for
// bowlers who want averages and trends without 30 taps a night (and for
// screenshots that only show totals). This is separate from `environment`
// because they're independent: someone can bowl league by-game and practice
// shot-by-shot, or the reverse.
export const TRACKING_MODES = ["shot", "game"];

export const TRACKING_MODE_LABELS = {
  shot: "Shot by shot",
  game: "Game scores only",
};

export const TRACKING_MODE_DESCRIPTIONS = {
  shot: "Log every delivery — unlocks leaves, spare conversion, and per-ball stats.",
  game: "Just the final score for each game. Fast, and still tracks averages and trends.",
};

// Stats cards the person can reorder or hide. Order here is the default
// order; anything not listed in a stored preference falls back to this,
// so adding a new card later doesn't require migrating anyone's saved
// layout -- it just appears at its default position.
//
// `fixed: true` marks cards that stay put regardless of ordering.
// "Viewing" is the bowler/league selector that controls everything below
// it, so it always sits at the top.
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
  { id: "byCenter", label: "By Bowling Center" },
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
    trackedFields: { surface: true, line: true, release: true, miss: true, ballSpeed: true, shoes: true, revRate: false, axisRotation: false },
    showMoneyGames: false,
  },
  league: {
    trackedFields: { surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: false, revRate: false, axisRotation: false },
    showMoneyGames: true,
  },
  tournament: {
    trackedFields: { surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: true, revRate: false, axisRotation: false },
    showMoneyGames: false,
  },
  casual: {
    trackedFields: { surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: false, revRate: false, axisRotation: false },
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
    // New users start with scores-only -- shot-by-shot is ~30 taps a game
    // and recreational bowlers bounced off it before finding the features
    // they'd pay for. Practice is the exception: its whole purpose is
    // examining your game, and all its accessory fields live in the shot
    // form, so scores-only there would show an empty screen.
    trackingMode: ENVIRONMENT_TRACKING_MODE[safeEnvironment] ?? "game",
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
    trackingMode: TRACKING_MODES.includes(raw.trackingMode) ? raw.trackingMode : base.trackingMode,
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
// Each environment carries the tracking mode that matches its purpose.
// Practice exists to examine your game, so it opens in shot-by-shot;
// casual exists to hide detail, so it forces scores-only. League and
// tournament keep whatever the bowler chose, since both are legitimate
// there and it's their call.
const ENVIRONMENT_TRACKING_MODE = { practice: "shot", casual: "game" };

export function applyEnvironment(prefs, environment) {
  // Casual is scores-only by definition -- the point is to hide the depth.
  if (environment === "casual") {
    const safe = { ...prefs, environment: "casual", trackingMode: "game" };
    const preset = presetFor("casual");
    return { ...safe, trackedFields: { ...preset.trackedFields }, showMoneyGames: preset.showMoneyGames };
  }
  const safeEnvironment = ENVIRONMENTS.includes(environment) ? environment : "league";
  const preset = presetFor(safeEnvironment);
  return {
    ...prefs,
    environment: safeEnvironment,
    // Practice turns shot logging back on: its accessory fields (surface,
    // line, release, miss, ball speed) all live inside the shot form, so
    // leaving it in scores-only mode would enable them and then show none
    // of them.
    trackingMode: ENVIRONMENT_TRACKING_MODE[safeEnvironment] ?? prefs.trackingMode,
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

export function setTrackingMode(prefs, mode) {
  if (!TRACKING_MODES.includes(mode)) return prefs;
  return { ...prefs, trackingMode: mode };
}
