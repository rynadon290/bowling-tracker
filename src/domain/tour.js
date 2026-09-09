// The tour a new bowler gets after setup.
//
// Setup already asks the two questions the app can't work without — your
// name and what you're bowling. What it can't do is explain what any of
// the five tabs are for, so a new bowler lands on a full app and has to
// discover it by poking. That's the gap this fills.
//
// Steps are DATA rather than markup so the sequence can be tested,
// reordered and filtered by environment without touching a component.

// A step's `when` decides whether it applies. Omitted means always.
const ALL_STEPS = [
  {
    id: "bowl",
    tab: "log",
    title: "Bowl",
    body: "Where you log. Pick your league and date at the top, then record what happened.",
  },
  {
    id: "tracking",
    tab: "log",
    title: "Two ways to track",
    // The choice that shapes everything downstream, so it's worth its
    // own step rather than a clause in the Bowl one. A bowler who
    // doesn't understand this picks shot-by-shot, finds it slow, and
    // concludes the app is heavy going -- when scores-only was there
    // the whole time.
    body: "Shot by shot records every ball — which pins fell, which ball you threw — and that's what powers spare stats and the scoresheet. Scores only just takes your final score for each game: 213, 196, 203. You can switch any time, and even start a night one way and finish the other.",
  },
  {
    id: "scoresheet",
    tab: "log",
    title: "Your ten frames",
    body: "The ten frames sit between the frame picker and the result buttons, filling in as you bowl. Tap any frame to go back and change it.",
    // Only meaningful when shots are being logged; a scores-only bowler
    // never sees a scoresheet, so promising one would be a lie.
    when: ({ trackingMode }) => trackingMode === "shot",
  },
  // ── How to actually record a shot ──────────────────────────────────
  //
  // Three worked examples rather than one abstract explanation. The
  // result buttons are only the first step for anything that isn't a
  // strike, and a bowler who doesn't know that gets stuck on their first
  // open frame -- which is the point most people would give up.
  {
    id: "score-strike",
    tab: "log",
    title: "Recording a strike",
    body: "Tap Strike. That's the whole frame — the app scores it and moves you to the next one.",
    when: ({ trackingMode }) => trackingMode === "shot",
  },
  {
    id: "score-spare",
    tab: "log",
    title: "Recording a spare",
    body: "Tap Other Leave, then tap the pins still standing on the rack. Answer Spare Made? — Yes. The app works out your first ball from the pins you left, so there's nothing else to count.",
    when: ({ trackingMode }) => trackingMode === "shot",
  },
  {
    id: "score-miss",
    tab: "log",
    title: "Recording an open frame",
    body: "Same start: Other Leave, then the pins on the rack. Answer Spare Made? — No. Then use − and + to set the total pins for the frame — both balls added together. Leave a 3-10 and knock one down, that's 9.",
    when: ({ trackingMode }) => trackingMode === "shot",
  },
  {
    id: "import",
    tab: null,
    title: "Import a scorecard",
    body: "Snap the monitor at the end of the night and the 📷 button at the top reads it — yours and your teammates'.",
  },
  {
    id: "history",
    tab: "history",
    title: "History",
    body: "Every night you've bowled, and every shot. Your own only — teammates keep their own.",
  },
  {
    id: "stats",
    // "data", not "stats". The nav's internal id for the Stats tab is
    // "data" -- sending "stats" hit the unknown-view guard in
    // BowlingTracker, which bounces anything unrecognised back to the
    // Bowl tab. The tour therefore jumped to Bowl while claiming to show
    // Stats.
    tab: "data",
    title: "Stats",
    body: "Averages, spare conversion, which ball is working. Compare yourself to a teammate, a friend or your team.",
  },
  {
    id: "insights",
    tab: "insights",
    title: "What's costing you pins",
    body: "The app reads your last few nights and tells you what it sees — the spare you keep missing, the ball that stopped carrying, whether your third game falls off. It updates on its own as you bowl; you don't have to ask for it.",
  },
  {
    id: "improve",
    tab: "insights",
    title: "Goals and drills",
    body: "Set a goal — spare conversion, average, strike rate — and watch it move as you bowl. Drills are for practice: pick a target, and the app counts your makes and misses.",
    // A goal against a casual night's scores isn't meaningful, and drills
    // are a practice tool.
    envs: ["practice", "league", "tournament"],
  },
  {
    id: "arsenal",
    tab: "locker",
    title: "Your balls and bags",
    body: "Add each ball you own — its name, layout and surface. Then build a bag: what you actually bring on the night. A league bag and a tournament bag can hold different balls, and tournaments often cap how many you may carry, so you can keep several. Logging which ball threw which shot is what makes the per-ball stats work.",
    // A casual bowler is on a house ball. Nothing here applies.
    envs: ["practice", "league", "tournament"],
  },
  {
    id: "vault",
    tab: "locker",
    title: "Vault",
    envs: ["league", "tournament"],
    body: "Your leagues, teams and ball arsenal live here. Add a league, then add your team right underneath.",
  },
  {
    id: "roster",
    tab: "locker",
    title: "Adding your teammates",
    envs: ["league"],
    body: "Build your roster in bowling order. Add each teammate with their name and email — that works whether or not they've signed up yet. You can start logging their scores immediately, no account needed. When they do sign up with that email, the invite is waiting for them, and accepting it connects them to everything you've already recorded.",
  },
  {
    id: "money",
    tab: "log",
    title: "Money games",
    envs: ["league", "tournament"],
    body: "Tap the pots you're in each night. Buy-ins are remembered per league, so you enter them once.",
    when: ({ showMoneyGames }) => !!showMoneyGames,
  },
];

// The coach track.
//
// Separate from the main tour because it's a different job: a coach
// arrives with bowlers already on the app and needs the roster view, not
// an explanation of how to log a strike. Offered when someone turns coach
// mode on, not at signup.
export const COACH_STEPS = [
  {
    id: "coach-roster",
    tab: "coaching",
    title: "Your bowlers",
    body: "Everyone you coach on one screen: what each is working on, how far along they are, and when you next see them. Tap a name to open their game.",
  },
  {
    id: "coach-tasks",
    tab: "coaching",
    title: "Setting a task",
    body: "Give a bowler something specific with a target and a date — 'ten pin conversion to 90% by the 15th'. It shows on their Improve tab, and progress updates as they bowl.",
  },
  {
    id: "coach-session",
    tab: "coaching",
    title: "Your next session",
    body: "Set when you next see each bowler. That's separate from their league night on purpose — you might coach on a practice lane on a different day entirely.",
  },
];

// The steps that apply, in order.
// The steps for a given situation.
//
// `track: "coach"` returns the coach walkthrough instead of the main one
// -- a coach arrives with bowlers already on the app and needs the roster
// view, not an explanation of how to log a strike.
//
// Otherwise the tour is scoped to the environment the bowler just chose.
// Someone bowling casually with friends doesn't need a league roster
// explained, and showing it would make the app look like more work than
// it is -- which is the moment a casual bowler decides it isn't for them.
export function tourSteps(preferences = {}, { track = "main" } = {}) {
  if (track === "coach") return COACH_STEPS;

  const env = preferences?.environment || "league";
  return ALL_STEPS.filter(s => {
    if (s.envs && !s.envs.includes(env)) return false;
    return !s.when || s.when(preferences);
  });
}

export function tourLength(preferences, opts) {
  return tourSteps(preferences, opts).length;
}

// Clamped rather than wrapped: running off either end of a tour should
// stop at the end, not silently loop a new bowler back to the start.
export function stepAt(preferences, index, opts) {
  const steps = tourSteps(preferences, opts);
  if (!steps.length) return null;
  const i = Math.max(0, Math.min(steps.length - 1, index));
  return steps[i];
}

export function isLastStep(preferences, index, opts) {
  return index >= tourSteps(preferences, opts).length - 1;
}

// ── Which tours has this bowler already seen? ───────────────────────────
//
// The tour is per ENVIRONMENT, not once per app. Someone who signs up
// bowling casually and comes back three months later for a league
// shouldn't have to work out the league features alone -- but equally
// shouldn't sit through the casual tour again.
//
// Stored as a list of track keys: "casual", "practice", "league",
// "tournament", "coach".

export function tourKeyFor(environment, isCoach = false) {
  if (isCoach) return "coach";
  return environment || "league";
}

export function hasSeenTour(seen, key) {
  return Array.isArray(seen) && seen.includes(key);
}

export function markTourSeen(seen, key) {
  const list = Array.isArray(seen) ? seen : [];
  return list.includes(key) ? list : [...list, key];
}

// Should we offer a tour right now?
//
// Only for a track they haven't seen. Deliberately an OFFER rather than
// an automatic takeover for anything after the first: interrupting
// someone who opened the app to log a game is worse than letting them
// find the feature themselves.
export function tourToOffer({ environment, isCoach = false, seen = [] } = {}) {
  const key = tourKeyFor(environment, isCoach);
  return hasSeenTour(seen, key) ? null : key;
}

// ── League setup ────────────────────────────────────────────────────────
//
// Choosing "league" with no league or team set up is a dead end: scores
// are filed against a league, so there's nowhere to put them. Rather than
// showing an empty screen, say so and offer to fix it.
export function needsLeagueSetup({ environment, leagues = [], teams = [] } = {}) {
  if (environment !== "league") return false;
  const realLeagues = (leagues || []).filter(l => l && l !== "Practice" && l !== "Casual");
  if (!realLeagues.length) return true;
  return !(teams || []).some(t => t && t.league && realLeagues.includes(t.league));
}

// Every tour available for replay from Settings.
//
// The coach track is gated: it only makes sense to someone who has bowlers
// to coach, and offering it to everyone would advertise a mode most people
// will never use. Everything else is always replayable -- someone who
// bowls league most weeks might still want the tournament walkthrough
// before their first one.
export const TOUR_TRACKS = [
  { key: "casual",     label: "Just bowling",  blurb: "Logging a night with friends" },
  { key: "practice",   label: "Practice",      blurb: "Drills, goals and shot-by-shot" },
  { key: "league",     label: "League",        blurb: "Leagues, teams, money games" },
  { key: "tournament", label: "Tournament",    blurb: "Squads, side pots and import" },
  { key: "coach",      label: "Coaching",      blurb: "Your bowlers, tasks and sessions", coachOnly: true },
];

export function availableTours(isCoach = false) {
  return TOUR_TRACKS.filter(t => !t.coachOnly || isCoach);
}
