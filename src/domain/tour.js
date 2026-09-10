import { CASUAL_BADGES } from "./casualBadges.js";
import { isContainerLeague } from "./leagueMembership.js";
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
    body: "Everything starts here. Choose how you're bowling tonight — practice, a league night, or a tournament — and the app sets itself up for it. Each one asks for different things, so you're never entering a lane pattern for a Sunday practice or a drill target on league night.",
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
    id: "shot-detail",
    tab: "log",
    title: "What shot by shot captures",
    body: "Every ball: which pins fell, which pins were left, and whether you made the spare. That's what separates 'I shot 180' from knowing you left six ten pins and made two of them. Add the ball you threw and it splits your stats by equipment too.",
    when: ({ trackingMode }) => trackingMode === "shot",
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
  // ── Just bowling ────────────────────────────────────────────────────
  //
  // Its own track, not a trimmed version of the basics. A casual bowler
  // isn't picking a league, isn't setting goals, and won't get much from
  // History or Stats after two nights a year. Four screens: get scores
  // in, see who won, share it.
  {
    id: "casual-people",
    tab: "log",
    title: "Everyone you're bowling with",
    body: "Add whoever's on the lane and they appear as a row in the scoresheet. They don't need the app, an account, or to do anything at all — one phone keeps score for the whole group.",
    envs: ["casual"],
  },
  {
    id: "casual-scores",
    tab: "log",
    title: "Simply type the scores",
    body: "Names down the side, games across the top — the same shape as the sheet on the monitor. Tap a cell, type the score, move on. Totals add themselves as you go, and if you bowl more than a few games the scores slide across while the names stay put.",
    envs: ["casual"],
  },
  {
    id: "casual-winner",
    tab: "log",
    title: "Who won",
    body: "Finish the night and the app works out the winner, the margin, and a few awards worth arguing about. Ties get called out too.",
    envs: ["casual"],
  },
  {
    id: "casual-standings",
    tab: "social",
    title: "Standings",
    body: "Every night you log builds up here. Everyone who's been on your scoresheet is listed by average, with how many games they've bowled and their best single game — so a big average over two games doesn't quietly outrank someone who's bowled twenty.",
    envs: ["casual"],
  },
  {
    id: "casual-badges",
    tab: "social",
    title: "Badges",
    body: `There are ${CASUAL_BADGES.length} to collect, and they're not all about bowling well. Some are for showing up, one or two you'd rather not have, and everyone earns something — even on a rough night.`,
    envs: ["casual"],
  },
  {
    id: "casual-share",
    tab: "log",
    title: "Share the night",
    body: "One tap makes a card with everyone's scores on it, ready for the group chat or social media.",
    envs: ["casual"],
  },

  // Each mode tour ends on what it produces -- the payoff for the setup
  // the rest of the tour just explained.

  // ── Practice ────────────────────────────────────────────────────────
  {
    id: "practice-modes",
    tab: "log",
    title: "Games or drills",
    body: "Practice splits two ways. Games is a normal night you happen to be bowling alone — full frames, real scores. Drill is targeted work: pick one thing, throw at it repeatedly, and the app counts makes and misses without pretending it's a game.",
    envs: ["practice"],
  },
  {
    id: "practice-drill",
    tab: "log",
    title: "Running a drill",
    body: "Choose a target — a specific spare, a pin combination, your own setup — then log each attempt as made or missed. No frames, no score, just the count. Come back next week and the same drill shows whether you're actually getting better at it.",
    envs: ["practice"],
  },

  {
    id: "practice-goals",
    tab: "log",
    title: "Working on something specific",
    body: "Set a goal and practice against it — spare conversion, strike rate, your average. It shows in bowling terms, so 'make 9 of your next 10 ten pins' rather than a percentage, and moves as you bowl.",
    envs: ["practice"],
  },
  {
    id: "practice-fields",
    tab: "log",
    title: "The extra detail",
    body: "Practice is where the accessory fields earn their place — ball speed, rev rate, axis rotation and plenty more. Turn on only the ones you're working on; they're per-field switches in Settings, not all or nothing.",
    envs: ["practice"],
  },
  {
    id: "practice-recap",
    tab: "log",
    title: "Your practice summary",
    body: "End the session and you get what actually happened: how the drill went against last week, which spares you converted, and whether the thing you came to work on moved. It's saved, so next week starts with a comparison rather than a guess.",
    envs: ["practice"],
  },

  // ── Tournament ──────────────────────────────────────────────────────
  {
    id: "tourney-setup",
    tab: "log",
    title: "Setting up the tournament",
    body: "Name it, set the format, and add the blocks you're bowling. Multi-day events get a block per day; a one-day squad is a single block. Games, lanes and the pattern all live under the block they belong to.",
    envs: ["tournament"],
  },
  {
    id: "tourney-cut",
    tab: "log",
    title: "The cut line",
    body: "Enter the cut and the app tracks where you stand against it as you bowl — how far above or below, and what you need across the games left. That's the number you're actually bowling to in a qualifier.",
    envs: ["tournament"],
  },
  {
    id: "tourney-pots",
    tab: "log",
    title: "Brackets and side pots",
    body: "Log what you entered and what came back. Brackets, side pots and the eliminator all sit together, so at the end of a long weekend you know what the entry fees actually cost you against what you won.",
    envs: ["tournament"],
  },
  {
    id: "tourney-match",
    tab: "log",
    title: "Match play",
    body: "Past the cut, record each match, your opponent and the result. Bonus pins are handled for you, and your match record carries alongside your scores instead of living on a scrap of paper.",
    envs: ["tournament"],
  },

  {
    id: "tourney-recap",
    tab: "log",
    title: "Your tournament, summed up",
    body: "At the end you get the whole event in one place: every block, where you finished against the cut, your match record, and what the entries and side pots netted out to. It stays in your history as a complete tournament, not a pile of loose games.",
    envs: ["tournament"],
  },

  {
    id: "import",
    tab: null,
    title: "Import a scorecard",
    // A casual night has no printed scorecard to photograph, and the
    // import flow asks "which team?" which a casual bowler doesn't have.
    envs: ["practice", "league", "tournament"],
    body: "Rather than typing a whole night in, take a picture of the scoring monitor or a nightly print out. Tap Import at the top, say what you're importing and pick the date, then add the photo. The app reads the games and the frames behind them to save you manual entry.",
  },
  {
    id: "import-verify",
    tab: null,
    title: "Checking an import",
    body: "Nothing saves until you've checked it. You tell it who belongs to each row, fix anything the camera misread, and confirm. Rows you map to a teammate are sent to their app inbox where they'll verify it all looks good before it counts for their data.",
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
    body: "Averages, spare conversion, which ball is working. Compare yourself to a friend, teammate, or your whole team.",
  },
  {
    id: "insights",
    tab: "insights",
    title: "What's costing you pins",
    body: "The app reads your nights and tells you what it sees — the spare you keep missing, the ball that stopped carrying, whether your third game falls off.",
    // Said plainly rather than discovered: someone who opens this on
    // night one and finds it empty concludes the feature is weak, when
    // it just hasn't got enough to work with yet.
    footnote: "This needs about ten games of shot-by-shot logging before it can say anything even somewhat meaningful, so be patient — and the more you bowl, the more tailored to you and better it'll get. Scores from casual nights aren't included.",
  },
  {
    id: "arsenal",
    tab: "locker",
    title: "Your balls and bags",
    body: "Add each ball you own — its name, layout and surface. Then build a bag: what you actually bring on the night. A league bag and a tournament bag can hold the same or different balls, and tournaments often cap how many you may bring, so feel free to make several bags.",
    // A casual bowler is on a house ball. Nothing here applies.
    envs: ["practice", "league", "tournament"],
  },
  {
    id: "vault",
    tab: "locker",
    title: "Vault",
    // League only. A tournament bowler sets their event up on the Bowl
    // tab, not in the Vault, and their gear is covered by the arsenal
    // step in the general tour.
    envs: ["league"],
    body: "Your leagues, teams and ball arsenal live here. Add a league, then add your team right underneath.",
  },
  {
    id: "roster",
    tab: "locker",
    title: "Adding your teammates",
    envs: ["league"],
    body: "Add each teammate with their name and email — that works whether or not they've signed up yet. When they do sign up with that email, the invite is waiting for them, and accepting it connects them to everything you've already logged under their name. Don't have someone's email? Tick the box and you'll get a short code to text them; they enter it when they sign up and land on the same spot.",
  },
  {
    id: "money",
    tab: "log",
    title: "Money games",
    // League only. A tournament bowler's entry fees and side pots are
    // covered by the tournament tour's own brackets step.
    envs: ["league"],
    body: "Tap the pots you're in each night. Buy-ins are remembered per league, so you enter them once.",
    when: ({ showMoneyGames }) => !!showMoneyGames,
  },
  {
    id: "league-recap",
    tab: "log",
    title: "Your night, summed up",
    body: "Finish the night and the recap pulls it together: your series, how the team did, your strikes and spares, the money games settled, and where it puts your average. Share it with your friends in one tap too.",
    envs: ["league"],
  },
];

// ── The general tour ────────────────────────────────────────────────────
//
// Everyone gets this one, whatever they answered at setup. It covers the
// things that are true in every mode: where you log, the two tracking
// depths, the scoresheet, how to record a strike, a spare and an open
// frame, and where History, Stats and Insights live.
//
// Splitting it out keeps the MODE tours short and about what's actually
// different -- a tournament bowler shouldn't sit through nine screens of
// basics before reaching the cut line, and a league bowler who later
// tries practice shouldn't be re-taught the scoresheet.
export const MODE_TRACKS = ["casual", "practice", "league", "tournament"];

export const GENERAL_STEP_IDS = [
  // Order matters: this is the order they're shown in. Shot detail sits
  // third, right after the tracking choice, because it's what that
  // choice actually buys you.
  "bowl", "tracking", "shot-detail", "scoresheet",
  "score-strike", "score-spare", "score-miss",
  "import", "import-verify", "stats", "insights", "arsenal",
];

export function generalSteps(preferences = {}) {
  return ALL_STEPS.filter(s => {
    if (!GENERAL_STEP_IDS.includes(s.id)) return false;

    // Deliberately NOT filtered by environment either.
    //
    // "The basics" is the everyone tour. Filtering it by the bowler's
    // CURRENT mode meant someone sitting in Just Bowling lost the import
    // pages entirely -- import is scoped to practice/league/tournament,
    // so a casual bowler replaying the basics got 10 steps instead of 13
    // and never saw how importing works.
    //
    // Same mistake as the trackingMode filter below, fixed only halfway
    // last time: the tour teaches what the app CAN do, not what this
    // bowler's settings happen to be right now.

    // Deliberately NOT filtered by trackingMode.
    //
    // New bowlers default to scores-only, and the shot-by-shot pages --
    // the scoresheet, and how to record a strike, spare and open frame --
    // are all gated on trackingMode === "shot". So the basics tour
    // silently dropped five of its thirteen pages for exactly the people
    // who most needed them: the step before had just told them
    // shot-by-shot exists, and then the tour never showed it.
    //
    // The tour is teaching what the app CAN do, not narrating what it's
    // set to right now.
    return true;
  });
}

// What's left for a given mode: only the steps unique to it.
export function modeSteps(environment) {
  return ALL_STEPS.filter(s =>
    !GENERAL_STEP_IDS.includes(s.id) &&
    (!s.envs || s.envs.includes(environment)));
}

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
    title: "Everyone you coach, one screen",
    body: "Your bowlers in a single list: what each is working on right now, how far along they are, when you next see them, and which league night they bowl.",
  },
  {
    id: "coach-open",
    tab: "coaching",
    title: "Opening a bowler's game",
    body: "Tap a name to see their real numbers — spare conversion by split type, which ball is carrying, how their third game compares to their first. This is their logged data, not a summary they typed for you.",
  },
  {
    id: "coach-tasks",
    tab: "coaching",
    title: "Assigning something to work on",
    body: "Give a bowler one specific thing with a number and a date: 'ten pin conversion to 90% by the 15th'. It appears on their Improve tab in bowling terms — 'make 9 of your next 10 ten pins' — and the progress bar moves on its own as they bowl.",
  },
  {
    id: "coach-goals",
    tab: "coaching",
    title: "Setting their goals",
    body: "Set a goal for a bowler straight from their row. It shows up as their goal, tracked the same way as one they set themselves, so you're both looking at the same number between sessions.",
  },
  {
    id: "coach-session",
    tab: "coaching",
    title: "Scheduling the next session",
    body: "Set when you next see each bowler, with a note about what you'll cover.",
  },
  {
    id: "coach-between",
    tab: "coaching",
    title: "What happens between sessions",
    body: "Their nights keep logging whether you're there or not. Come back a week later and the roster already shows what changed — no more 'so how'd it go?'",
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
export function tourSteps(preferences = {}, opts = {}) {
  const { track = "main", skipSeen = [] } = opts || {};
  // Step predicates destructure this, so a non-object would throw
  // inside the filter rather than here.
  if (!preferences || typeof preferences !== "object") preferences = {};
  const base = (() => {
    if (track === "coach") return COACH_STEPS;

    // "general" is the everyone tour -- the basics, whatever mode they
    // chose. The mode tracks are only what's different about that mode,
    // which is what keeps them short enough to actually watch.
    if (track === "general") return generalSteps(preferences);

    const env = MODE_TRACKS.includes(track) ? track : (preferences?.environment || "league");
    if (MODE_TRACKS.includes(track)) return modeSteps(env);

    // No track named: the full tour for this environment. Kept for the
    // replay-everything case and for anything that predates the split.
    return ALL_STEPS.filter(s => {
      if (s.envs && !s.envs.includes(env)) return false;
      return !s.when || s.when(preferences);
    });
  })();

  // Steps already seen in an earlier tour are dropped.
  //
  // A league bowler who did the casual tour first shouldn't sit through
  // "this is the History tab" again -- the overlap between tracks is
  // large, and repeating it teaches nothing and reads as padding.
  if (!skipSeen?.length) return base;
  const seen = new Set(skipSeen);
  const trimmed = base.filter(s => !seen.has(s.id));
  // Never return nothing: a tour that's entirely overlap should still
  // show its first step rather than flashing open and closed.
  return trimmed.length ? trimmed : base.slice(0, 1);
}

// Which step ids a bowler has already been shown.
export function stepsSeenFrom(seenSteps) {
  return Array.isArray(seenSteps) ? seenSteps : [];
}

export function recordStepsSeen(seenSteps, steps) {
  const set = new Set(stepsSeenFrom(seenSteps));
  for (const s of (Array.isArray(steps) ? steps : [])) set.add(s?.id);
  return [...set];
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
  // "Casual" was the old name for the container; it is "Just Bowling"
  // now, so this filter had stopped excluding it. Harmless today only
  // because the team check below catches the same case -- but it would
  // bite the moment a team were attached to it.
  const realLeagues = (leagues || []).filter(l => l && !isContainerLeague(l));
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
  { key: "general",    label: "The basics",    blurb: "Logging, scoring, stats — everyone gets this" },
  { key: "casual",     label: "Just bowling",  blurb: "Scores, who won, sharing it" },
  { key: "practice",   label: "Practice",      blurb: "Drills, goals and shot-by-shot" },
  { key: "league",     label: "League",        blurb: "Leagues, teams, money games" },
  { key: "tournament", label: "Tournament",    blurb: "Squads, side pots and import" },
  { key: "coach",      label: "Coaching",      blurb: "Your bowlers, tasks and sessions", coachOnly: true },
];

export function availableTours(isCoach = false) {
  return TOUR_TRACKS.filter(t => !t.coachOnly || isCoach);
}

// The mode walkthrough waiting for this bowler, if any.
//
// Offered through the inbox rather than played at signup. Everyone gets
// the general tour when they finish setup; stacking the mode tour onto
// the end of it makes signup twenty screens long, which is where people
// close the app. The inbox lets them come back to it.
//
// Casual gets nothing: there are no casual-only features to explain, and
// a casual bowler is the least likely to want more onboarding.
export function pendingModeTour(arg) {
  const { environment, seen = [] } = arg || {};
  // Casual is excluded: the casual track IS their first tour, played at
  // setup, so there's no follow-up to offer.
  if (environment === "casual") return null;
  if (!MODE_TRACKS.includes(environment)) return null;
  if (hasSeenTour(seen, environment)) return null;
  if (!modeSteps(environment).length) return null;

  const track = TOUR_TRACKS.find(t => t.key === environment);
  const detail = {
    practice: "Drills, and how practice tracking stays separate from your league nights.",
    league: "Leagues, team rosters and money games — the parts that only apply to league.",
    tournament: "Blocks, the cut line, brackets and match play.",
  }[environment];

  return { key: environment, label: track?.label || environment, detail };
}
