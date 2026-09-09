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
    body: "Shot by shot records every ball — which pins fell, which ball you threw — and that's what powers spare stats and the scoresheet. Scores only takes three numbers a night. You can switch any time, and even start a night one way and finish the other.",
  },
  {
    id: "scoresheet",
    tab: "log",
    title: "Your ten frames",
    body: "The scoresheet fills in as you bowl. Tap any frame to fix it — you don't have to go hunting through a list.",
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
    body: "Tap Other Leave, then tap the pins still standing after your first ball. Answer Spare Made? — Yes. The app works out your first ball from the pins you left, so there's nothing else to count.",
    when: ({ trackingMode }) => trackingMode === "shot",
  },
  {
    id: "score-miss",
    tab: "log",
    title: "Recording an open frame",
    body: "Same start: Other Leave, then the pins standing. Answer Spare Made? — No. Now set Total Pins This Frame — both balls added together. Leave a 3-10 and knock one down, that's 9.",
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
    id: "improve",
    tab: "insights",
    title: "Improve",
    body: "Set a goal, run a drill, see what's actually costing you pins.",
  },
  {
    id: "vault",
    tab: "locker",
    title: "Vault",
    body: "Your leagues, teams and ball arsenal live here. Add a league, then add its team right underneath.",
  },
  {
    id: "money",
    tab: "log",
    title: "Money games",
    body: "Tap the pots you're in each night. Buy-ins are remembered per league, so you enter them once.",
    when: ({ showMoneyGames }) => !!showMoneyGames,
  },
];

// The steps that apply, in order.
export function tourSteps(preferences = {}) {
  return ALL_STEPS.filter(s => !s.when || s.when(preferences));
}

export function tourLength(preferences) {
  return tourSteps(preferences).length;
}

// Clamped rather than wrapped: running off either end of a tour should
// stop at the end, not silently loop a new bowler back to the start.
export function stepAt(preferences, index) {
  const steps = tourSteps(preferences);
  if (!steps.length) return null;
  const i = Math.max(0, Math.min(steps.length - 1, index));
  return steps[i];
}

export function isLastStep(preferences, index) {
  return index >= tourSteps(preferences).length - 1;
}
