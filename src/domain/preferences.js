import { normalizeThemeId, DEFAULT_THEME } from "./themes.js";
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

// "Frame tracking" and "Game tracking".
//
// "Shot by shot" described the ACTION -- you log each delivery -- and
// sat opposite "Game scores only", which described the DATA. Two halves
// of one choice, named on different axes, so neither told you what the
// other was. A bowler reading "Shot by shot" had to work out that the
// alternative existed.
//
// Frame and game are the two units bowlers already think in, and naming
// both the same way makes the choice legible in a glance.
//
// The stored values stay "shot" and "game" -- every session, preference
// and cloud row is keyed by them, and renaming those would orphan the
// lot for a label change.
export const TRACKING_MODE_LABELS = {

  shot: "Frame tracking",

  game: "Game tracking",
};

export const TRACKING_MODE_DESCRIPTIONS = {
  shot: "Every frame — leaves, spare conversion and how each ball carried.",
  game: "The final score for each game. Fast, and still tracks averages and trends.",
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
  { id: "money", label: "Money Games" },
  { id: "threeSixNine", label: "3-6-9 Tracker" },
];

// Default card order, per environment.
//
// One flat order can't serve four modes. The original list led with
// head-to-head and team records, which is reasonable on a league night
// and meaningless in practice -- a bowler drilling ten pins alone had to
// scroll past nine team cards to reach anything about their own game.
//
// The ordering rule is the same everywhere: what you came to this screen
// for, then the context that explains it, then the detail you go looking
// for deliberately. What differs is which cards fall into which band.
//
// These are DEFAULTS. Anyone who has reordered their own cards keeps
// their arrangement -- see normalizeStatsCardOrder.
// Cards hidden by default in an environment because the figure they show
// isn't meaningful there.
//
// Practice has no running average: practice games aren't a competitive
// average -- cAvg already excludes them from the composite -- so showing
// one invites reading it as "your average", which it isn't.
//
// Hidden rather than removed from the order, because reconcileCardOrder
// appends any missing card back on load; the order list can't hide
// anything on its own. Still unhideable in Settings if someone wants it.
const HIDDEN_BY_ENVIRONMENT = {
  practice: ["runningAverages"],
};

const ORDER_BY_ENVIRONMENT = {
  // League night: your own line first, then where the team stands, then
  // the technical detail behind it. Side pots last -- they matter, but
  // not before you know how you bowled.
  league: [
    "headlineStats", "runningAverages", "gameByGame", "theoreticalAverage",
    "cleanFrames", "seasonRecord", "weeklyPoints", "teamSeries",
    "teamLeaderboard", "headToHead", "teamRecords", "giantKiller",
    "hung", "handicapImpact", "tenPinLeaves", "singlePinSpares",
    "splits", "nonSplitLeaves", "loneFivePin", "firstBallAverage",
    "framePosition", "strikeStreak", "strikeQuality", "byBall",
    "releaseQuality", "missDistribution", "ballChangeTriggers", "byCenter",
    "progress", "consistency", "scoreDistribution", "money",
    "threeSixNine",
  ],
  // Practice: execution quality and what to change, since that's the
  // entire point of being there. Team cards sink to the bottom -- there
  // is no team in a practice session, so they're almost always empty.
  practice: [
    "headlineStats", "cleanFrames", "firstBallAverage", "framePosition",
    "tenPinLeaves", "singlePinSpares", "splits", "nonSplitLeaves",
    "loneFivePin", "byBall", "releaseQuality", "missDistribution",
    "ballChangeTriggers", "strikeQuality", "strikeStreak", "progress",
    "consistency", "scoreDistribution", "gameByGame", "theoreticalAverage",
    "byCenter", "seasonRecord", "weeklyPoints", "teamSeries",
    "teamLeaderboard", "headToHead", "teamRecords", "giantKiller",
    "hung", "handicapImpact", "money", "threeSixNine",
  ],
  // Tournament: you're on an unfamiliar pattern in an unfamiliar house,
  // so center and equipment come early, and the score-shape cards that
  // tell you whether you're cashing come before technical detail.
  tournament: [
    "headlineStats", "byCenter", "byBall", "scoreDistribution",
    "consistency", "runningAverages", "gameByGame", "theoreticalAverage",
    "money", "cleanFrames", "tenPinLeaves", "singlePinSpares",
    "splits", "nonSplitLeaves", "loneFivePin", "firstBallAverage",
    "framePosition", "strikeStreak", "strikeQuality", "releaseQuality",
    "missDistribution", "ballChangeTriggers", "progress", "seasonRecord",
    "weeklyPoints", "teamSeries", "teamLeaderboard", "headToHead",
    "teamRecords", "giantKiller", "hung", "handicapImpact",
    "threeSixNine",
  ],
  // Casual is scores-only, so almost every shot-derived card is empty.
  // The few that work off game scores come first; the rest stay in a
  // sensible order for the rare casual bowler who turns tracking up.
  casual: [
    "headlineStats", "runningAverages", "gameByGame", "theoreticalAverage",
    "scoreDistribution", "consistency", "progress", "cleanFrames",
    "tenPinLeaves", "singlePinSpares", "splits", "nonSplitLeaves",
    "loneFivePin", "firstBallAverage", "framePosition", "strikeStreak",
    "strikeQuality", "byBall", "byCenter", "releaseQuality",
    "missDistribution", "ballChangeTriggers", "seasonRecord", "weeklyPoints",
    "teamSeries", "teamLeaderboard", "headToHead", "teamRecords",
    "giantKiller", "hung", "handicapImpact", "money",
    "threeSixNine",
  ],
};

// Any card missing from an environment's list is appended in its
// STATS_CARDS position, so adding a new card can never silently drop it
// from three of the four modes.
export function defaultStatsCardOrder(environment) {
  const listed = ORDER_BY_ENVIRONMENT[environment] || ORDER_BY_ENVIRONMENT.league;
  const valid = listed.filter(id => MOVABLE_STATS_CARD_IDS.includes(id));
  const seen = new Set(valid);
  return [...valid, ...MOVABLE_STATS_CARD_IDS.filter(id => !seen.has(id))];
}

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

// ── What you are bowling, in words ──────────────────────────────────────
//
// One source for all three, because there were two identical copies --
// one in Onboarding.jsx, one in SessionStart.jsx -- and nothing stopped
// them drifting. Editing the question in one place and not the other is
// how the same screen ends up saying two things.
//
// SHORT labels are for chips and headers, where there is no room for a
// sentence. QUESTION labels are the answers to "What are you bowling
// today?", where a phrase reads better than a noun -- "A league night"
// is an occasion, "League" is an identity, and people were answering the
// second question when the app meant the first.
// The casual label reads "Open bowling", but the STORED key stays
// "Just Bowling" -- CASUAL_SESSION_KEY in constants.js builds league
// names written to the database ("Just Bowling\u00b7<userId>"), and
// isContainerLeague matches the literal. Renaming that constant would
// orphan every casual session ever logged. Display and storage are
// deliberately different here; do not reconcile them.
export const ENVIRONMENT_LABELS = {
  practice: "Practice", league: "League", tournament: "Tournament", casual: "Open bowling",
};

export const ENVIRONMENT_QUESTION_LABELS = {
  practice: "A practice session",
  league: "A league night",
  tournament: "A tournament",
  casual: "Open bowling",
};

// Each says what the choice DOES, not what sort of person picks it.
//
// Focus group Finding 1: 61 of 250 picked the wrong mode. The old
// descriptions described the occasion, which the label already covered,
// and left the consequences unsaid.
//
// The fourth line breaks the pattern on purpose. Three "enables" then a
// "hides" is the only signal that one of these four takes something
// away -- casual forces scores-only and removes four screens, and
// nothing previously said so.
// The onboarding screen shows the four LABELS and nothing else.
//
// Four descriptions on a first-run screen is sixty words asking someone
// to compare features before they have seen any of them. The thing they
// actually need to know is that the choice is not final -- so that is
// said once, below all four, instead of four times inside them.
export const ENVIRONMENT_REASSURANCE =
  "There's no wrong answer. Each one just changes which screens you see, and you can switch at any time from the Bowl tab or Settings.";

// Settings gets the full version, because someone here came ON PURPOSE.
//
// A first-timer is picking fast and wants to get on with it. Someone in
// Settings is deliberately changing modes and the question in their head
// is "what will this actually do" -- so this is plain prose that answers
// it, not a feature list and not a tagline.
export const ENVIRONMENT_DESCRIPTIONS = {

  practice: "For working on your game. Drills, frame tracking and every detail field are available, and practice scores stay out of your league averages.",

  league: "For your weekly team night. Your team roster and standings are available, along with money games.",

  tournament: "For higher-stakes competition. Blocks, squads, side pots, brackets, match play and the cut line are all available.",

  casual: "For a fun activity. You get the scoresheet, standings and badges — all other views are hidden, not deleted, to keep it quick and simple.",

};

// Whether the coach view is switched on. Only meaningful for someone whose
// profile says they coach -- see coachViewActive below, which is what the
// app should actually branch on.
export function setCoachView(prefs, value) {
  return { ...prefs, coachView: !!value };
}

// The single source of truth for "show coaching UI". Requires BOTH the
// profile flag and the toggle: a bowler who was once a coach, or who
// flipped the toggle before unsetting the flag, must not be left in a
// coach view of their own data.
export function coachViewActive(prefs, profile) {
  return !!(profile?.isCoach && prefs?.coachView);
}

// What a FRESH profile starts on in each environment. Practice defaults to
// shot-by-shot because its accessory fields all live in the shot form.
const ENVIRONMENT_DEFAULT_TRACKING = { practice: "shot", casual: "game" };

// What an environment FORCES when selected, regardless of any choice.
// Only casual: it exists specifically to hide detail, so scores-only is
// the whole point of it.
const ENVIRONMENT_FORCED_TRACKING = { casual: "game" };

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
    trackingMode: ENVIRONMENT_DEFAULT_TRACKING[safeEnvironment] ?? "game",
    trackedFields: { ...preset.trackedFields },
    showMoneyGames: preset.showMoneyGames,
    // Every pot shown by default. Present here as well as in
    // normalizePreferences, or a normalize round-trip adds a field the
    // defaults lack and the two objects stop matching.
    hiddenMoneyGames: [],
    statsCardOrder: defaultStatsCardOrder(safeEnvironment),
    hiddenStatsCards: [...(HIDDEN_BY_ENVIRONMENT[safeEnvironment] || [])],
    // Colour theme. Independent of environment: switching to practice
    // should not change what the app looks like.
    theme: DEFAULT_THEME,
    // Off by default even for coaches -- someone opening the app to bowl
    // their own league night shouldn't land in coaching mode.
    coachView: false,
    trackingModeChoices: {},
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
// Declared above normalizePreferences, which filters against it. `const`
// isn't hoisted, so leaving it further down worked only by accident of
// call timing.
export const MONEY_GAMES = ["pokerQuarter", "pokerDollar", "highGame", "threeSixNine"];

export function normalizePreferences(raw) {
  const base = defaultPreferences(raw?.environment);
  if (!raw || typeof raw !== "object") return base;
  return {
    environment: ENVIRONMENTS.includes(raw.environment) ? raw.environment : base.environment,
    trackingMode: TRACKING_MODES.includes(raw.trackingMode) ? raw.trackingMode : base.trackingMode,
    trackedFields: { ...base.trackedFields, ...(raw.trackedFields || {}) },
    showMoneyGames: typeof raw.showMoneyGames === "boolean" ? raw.showMoneyGames : base.showMoneyGames,
    // Which individual pots are hidden.
    //
    // normalizePreferences rebuilds the object field by field, so a field
    // missing HERE is silently dropped on every save -- which is exactly
    // what happened: hiding one pot appeared to work, then reverted the
    // moment anything else was saved.
    hiddenMoneyGames: Array.isArray(raw.hiddenMoneyGames)
      ? raw.hiddenMoneyGames.filter(g => MONEY_GAMES.includes(g))
      : [],
    statsCardOrder: reconcileCardOrder(raw.statsCardOrder),
    hiddenStatsCards: Array.isArray(raw.hiddenStatsCards)
      ? raw.hiddenStatsCards.filter(id => MOVABLE_STATS_CARD_IDS.includes(id))
      : [],
    theme: normalizeThemeId(raw.theme),
    coachView: typeof raw.coachView === "boolean" ? raw.coachView : base.coachView,
    trackingModeChoices: (() => {
      const raw2 = raw.trackingModeChoices;
      if (!raw2 || typeof raw2 !== "object") return {};
      const out = {};
      for (const env of ENVIRONMENTS) {
        if (TRACKING_MODES.includes(raw2[env])) out[env] = raw2[env];
      }
      return out;
    })(),
  };
}

// Moves a card up or down by one position. Out-of-range moves are no-ops
// rather than errors, so the UI can render the buttons unconditionally.
export function moveStatsCard(prefs, cardId, direction) {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return prefs;
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
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return prefs;
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


// True when this order is still one of the built-in defaults -- i.e. the
// person has never dragged a card. Switching environments then re-sorts
// for the new mode; if they HAVE customised it, their arrangement is
// theirs and survives the switch.
function isDefaultOrder(order) {
  const current = JSON.stringify(reconcileCardOrder(order));
  return ENVIRONMENTS.some(env => JSON.stringify(defaultStatsCardOrder(env)) === current)
    || current === JSON.stringify([...MOVABLE_STATS_CARD_IDS]);
}

export function applyEnvironment(prefs, environment) {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return prefs;
  // Casual is scores-only by definition -- the point is to hide the depth.
  if (environment === "casual") {
    const safe = { ...prefs, environment: "casual", trackingMode: "game" };
    const preset = presetFor("casual");
    return {
      ...safe,
      trackedFields: { ...preset.trackedFields },
      showMoneyGames: preset.showMoneyGames,
      statsCardOrder: isDefaultOrder(prefs?.statsCardOrder)
        ? defaultStatsCardOrder("casual")
        : reconcileCardOrder(prefs?.statsCardOrder),
    };
  }
  const safeEnvironment = ENVIRONMENTS.includes(environment) ? environment : "league";
  const preset = presetFor(safeEnvironment);
  return {
    ...prefs,
    environment: safeEnvironment,
    statsCardOrder: isDefaultOrder(prefs?.statsCardOrder)
      ? defaultStatsCardOrder(safeEnvironment)
      : reconcileCardOrder(prefs?.statsCardOrder),
    // Practice turns shot logging back on: its accessory fields (surface,
    // line, release, miss, ball speed) all live inside the shot form, so
    // leaving it in scores-only mode would enable them and then show none
    // of them.
    // Order matters: casual's force wins outright; otherwise an explicit
    // choice for THIS environment wins; otherwise the environment's own
    // default; otherwise whatever was already set.
    trackingMode:
      ENVIRONMENT_FORCED_TRACKING[safeEnvironment]
      ?? prefs?.trackingModeChoices?.[safeEnvironment]
      ?? ENVIRONMENT_DEFAULT_TRACKING[safeEnvironment]
      ?? prefs.trackingMode,
    trackedFields: { ...preset.trackedFields },
    showMoneyGames: preset.showMoneyGames,
  };
}

export function resetToEnvironmentDefaults(prefs) {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return prefs;
  return defaultPreferences(prefs.environment);
}

export function setTrackedField(prefs, field, value) {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return prefs;
  return { ...prefs, trackedFields: { ...prefs.trackedFields, [field]: value } };
}

export function setShowMoneyGames(prefs, value) {
  return { ...prefs, showMoneyGames: value };
}

export function setTrackingMode(prefs, mode) {
  if (!TRACKING_MODES.includes(mode)) return prefs;
  // Remembered against the environment it was made in. Without this,
  // re-selecting Practice reset a bowler who had chosen to track practice
  // by game score -- so "just let me enter my scores" could never stick.
  const env = prefs?.environment || "league";
  return {
    ...prefs,
    trackingMode: mode,
    trackingModeChoices: { ...(prefs?.trackingModeChoices || {}), [env]: mode },
  };
}


export function setTheme(prefs, themeId) {
  return { ...prefs, theme: normalizeThemeId(themeId) };
}

// ── Which money games this league actually runs ─────────────────────────
//
// showMoneyGames is all-or-nothing, which meant a house that runs a
// quarter game and nothing else still saw boxes for the dollar game,
// high game and 3-6-9 every week -- four rows of which three are noise.
//
// Hidden here means "this pot doesn't exist for me", which is different
// from "I didn't play it tonight" (see participation below).

export const MONEY_GAME_LABELS = {
  pokerQuarter: "Quarter game",
  pokerDollar: "Dollar game",
  highGame: "High game",
  threeSixNine: "3-6-9",
};

export function hiddenMoneyGames(prefs) {
  const raw = prefs?.hiddenMoneyGames;
  return Array.isArray(raw) ? raw.filter(g => MONEY_GAMES.includes(g)) : [];
}

export function isMoneyGameShown(prefs, game) {
  return !hiddenMoneyGames(prefs).includes(game);
}

export function setMoneyGameHidden(prefs, game, hidden) {
  if (!MONEY_GAMES.includes(game)) return prefs;
  const current = hiddenMoneyGames(prefs);
  const next = hidden
    ? (current.includes(game) ? current : [...current, game])
    : current.filter(g => g !== game);
  return { ...prefs, hiddenMoneyGames: next };
}

export function visibleMoneyGames(prefs) {
  // showMoneyGames still gates the whole section for environments that
  // never have pots (practice, casual). Within an environment that does,
  // the per-pot switches decide.
  if (prefs && prefs.showMoneyGames === false) return [];
  return MONEY_GAMES.filter(g => isMoneyGameShown(prefs, g));
}

// Are any money games shown at all?
//
// showMoneyGames used to be a separate master switch, which could
// disagree with the per-pot list -- a pot marked shown while the whole
// card was hidden. The pots are now the single source of truth: the card
// appears when at least one pot is on.
export function anyMoneyGameShown(prefs) {
  return visibleMoneyGames(prefs).length > 0;
}
