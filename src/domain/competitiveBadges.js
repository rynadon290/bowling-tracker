// Badges for league, tournament and practice.
//
// Separate from casualBadges.js on purpose. Casual thresholds were tuned
// for people who bowl a few times a year -- "broke 100", "under 70",
// "finished last". Against a real average those are either routine or
// mockery, so none of them appear here.
//
// EARNING IS MODE-GATED, DISPLAY IS NOT.
//
// Each badge names the modes it can be earned in. A collection always
// shows all 38 slots whatever mode you are in now, so a league bowler who
// also practises sees their drill badges sitting next to their league
// ones, and a badge they can never earn in their usual mode stays
// visibly locked rather than hidden.
//
// The two gates that matter, both deliberate:
//
//   PRACTICE earns drill badges and NOTHING else -- not even 300 or 800.
//   Bowlers do not count practice honor scores, and a badge that says
//   otherwise would be wrong in front of people who know that.
//
//   RAMPING UP and STRONG FINISH are competition-only. A rising score
//   across three games means something under pressure; in practice it
//   might just mean you started cold on purpose.

export const LEAGUE = "league";
export const TOURNAMENT = "tournament";
export const PRACTICE = "practice";

// Repeatable badges count every occasion. One-off badges are a threshold
// you cross once -- "earned 4 times" for "three full seasons" is
// nonsense. Same distinction casualBadges.js draws, same reason.
export const REPEATABLE = new Set([
  "new-high-game", "new-high-series", "book-buster", "in-the-pocket",
  "heater", "cold-start-warm-finish", "clean", "sharp-shooter",
  "carried-it", "held-the-line", "team-high-game", "team-high-series",
  "full-roster", "cashed", "perfect-game", "eight-hundred",
  "made-the-cut", "top-five", "won-it", "ramping-up", "strong-finish",
  "cashed-side-pot", "squeaked-in",
  "two-sided", "midnight-oil",
]);

export const COMPETITIVE_BADGES = [
  // ── League: showing up ────────────────────────────────────────────
  // "league-first-night", not "first-night" -- casualBadges.js already
  // owns that id. The pools never render in one grid so a shared ICON is
  // harmless, but a shared id would collide the moment anything keys both
  // sets from one map.
  { id: "league-first-night", emoji: "\u{1F3B3}", name: "First night",
    blurb: "Bowled your first league night.", modes: [LEAGUE] },
  { id: "ironman", emoji: "\u{1F9BE}", name: "Ironman",
    blurb: "Didn't miss a scheduled night all season.", modes: [LEAGUE] },
  { id: "old-guard", emoji: "\u{1F3DB}\uFE0F", name: "Old guard",
    blurb: "Three full seasons in the same league.", modes: [LEAGUE] },
  { id: "sub-covered", emoji: "\u{1F9E9}", name: "Sub covered",
    blurb: "Bowled as a sub for another team.", modes: [LEAGUE] },

  // ── League: scoring, scaled to you ────────────────────────────────
  //
  // No flat thresholds. A 220 bowler clearing 200 is not an achievement,
  // which is exactly what casual's "Two hundred" would have claimed.
  { id: "new-high-game", emoji: "\u{1F4C8}", name: "New high game",
    blurb: "Beat your own high game.", modes: [LEAGUE] },
  { id: "new-high-series", emoji: "\u{1F680}", name: "New high series",
    blurb: "Beat your own high series.", modes: [LEAGUE] },
  { id: "book-buster", emoji: "\u{1F9E8}", name: "Book buster",
    blurb: "A game 40+ pins over your book average.", modes: [LEAGUE] },
  { id: "in-the-pocket", emoji: "\u{1F4CF}", name: "In the pocket",
    blurb: "Three games in a night within 5 pins of your average.", modes: [LEAGUE] },
  { id: "heater", emoji: "\u{1F525}", name: "Heater",
    blurb: "Three straight games above your average.", modes: [LEAGUE] },
  { id: "cold-start-warm-finish", emoji: "\u2744\uFE0F", name: "Cold night, warm finish",
    blurb: "Opened below average, closed above it.", modes: [LEAGUE] },
  { id: "raised-book-average", emoji: "\u{1F4F6}", name: "Raised book average",
    blurb: "Your average is 5+ pins above last season's book.", modes: [LEAGUE] },
  { id: "clean", emoji: "\u{1F9F9}", name: "Clean",
    blurb: "No open frames all night.", modes: [LEAGUE] },
  { id: "sharp-shooter", emoji: "\u{1F3F9}", name: "Sharp shooter",
    blurb: "Converted three or more splits in a night.", modes: [LEAGUE] },

  // ── League: team ──────────────────────────────────────────────────
  { id: "carried-it", emoji: "\u{1F91D}", name: "Carried it",
    blurb: "Your score was the difference in a match your team won.", modes: [LEAGUE] },
  { id: "held-the-line", emoji: "\u{1F6E1}\uFE0F", name: "Held the line",
    blurb: "Bowled above your average in a match your team lost.", modes: [LEAGUE] },
  { id: "team-high-game", emoji: "\u{1F947}", name: "Team high game",
    blurb: "Set your team's high game for the night.", modes: [LEAGUE] },
  { id: "team-high-series", emoji: "\u{1F3C6}", name: "Team high series",
    blurb: "Set your team's high series for the night.", modes: [LEAGUE] },
  { id: "full-roster", emoji: "\u{1F9F1}", name: "Full roster",
    blurb: "Every regular bowler on your team showed up.", modes: [LEAGUE] },
  { id: "executioner", emoji: "\u2694\uFE0F", name: "Executioner",
    blurb: "Helped hang a teammate 30 times.", modes: [LEAGUE] },

  // ── League: money ─────────────────────────────────────────────────
  { id: "cashed", emoji: "\u{1F4B5}", name: "Cashed",
    blurb: "Won a money game.", modes: [LEAGUE] },
  { id: "money-bags", emoji: "\u{1F4B0}", name: "Money bags",
    blurb: "$100 won in money games, all-time.", modes: [LEAGUE] },
  { id: "locked-in", emoji: "\u{1F512}", name: "Locked in",
    blurb: "Your book average was confirmed at season end.", modes: [LEAGUE] },

  // ── Honor scores: league and tournament, never practice ───────────
  //
  // The numbers ARE the icon. A 300 does not need a symbol standing in
  // for it, and bowlers read the number faster than any emoji.
  //
  // Also fires the existing honor-score notification in achievements.js
  // -- the popup is the moment, this is the permanent record. Both read
  // the same HONOR_GAME / HONOR_SERIES constants so they cannot disagree
  // about whether one happened.
  { id: "perfect-game", emoji: "300", name: "Perfect game",
    blurb: "Twelve strikes. The one you'll be telling people about.",
    modes: [LEAGUE, TOURNAMENT] },
  { id: "eight-hundred", emoji: "800", name: "800 series",
    blurb: "An 800 series. USBC honor score.",
    modes: [LEAGUE, TOURNAMENT] },

  // ── Tournament ────────────────────────────────────────────────────
  { id: "first-tournament", emoji: "\u{1F39F}\uFE0F", name: "First tournament",
    blurb: "Logged your first tournament.", modes: [TOURNAMENT] },
  { id: "made-the-cut", emoji: "\u2702\uFE0F", name: "Made the cut",
    blurb: "Survived to the next round.", modes: [TOURNAMENT] },
  { id: "top-five", emoji: "\u{1F3C5}", name: "Top five",
    blurb: "Finished in the top five.", modes: [TOURNAMENT] },
  { id: "won-it", emoji: "\u{1F451}", name: "Won the whole thing",
    blurb: "First place.", modes: [TOURNAMENT] },
  // Competition-only, and the reason the mode gate exists: every step
  // has to rise, not just the first-to-last total. Three flat games and
  // one big one is Strong finish, not a ramp.
  { id: "ramping-up", emoji: "\u{1FA9C}", name: "Ramping up",
    blurb: "Three or more straight games, each higher than the last.",
    modes: [TOURNAMENT] },
  // The average EXCLUDES the last game -- including it would let a big
  // finish inflate the bar it is being measured against.
  { id: "strong-finish", emoji: "\u{1F4AA}", name: "Strong finish",
    blurb: "Last game 50+ pins above the average of the rest.",
    modes: [TOURNAMENT] },
  { id: "cashed-side-pot", emoji: "\u{1F3B0}", name: "Cashed a side pot",
    blurb: "Won a side pot at an event.", modes: [TOURNAMENT] },
  { id: "squeaked-in", emoji: "\u{1F6EC}", name: "Squeaked in",
    blurb: "Made the cut by 10 pins or fewer.", modes: [TOURNAMENT] },

  // ── Practice: drills only ─────────────────────────────────────────
  //
  // Nothing else is earnable here. Not the scoring badges, not the
  // honor scores -- bowlers don't count practice 300s, and claiming
  // otherwise would be wrong in front of anyone who knows that.
  { id: "first-drill", emoji: "\u{1F9EA}", name: "First drill",
    blurb: "Logged your first drill.", modes: [PRACTICE] },
  { id: "repeat-customer", emoji: "\u{1F502}", name: "Repeat customer",
    blurb: "Same target, five separate sessions.", modes: [PRACTICE] },
  { id: "trending-up", emoji: "\u{1F331}", name: "Trending up",
    blurb: "Conversion rate rose across five weeks.", modes: [PRACTICE] },
  { id: "century", emoji: "\u{1F4AF}", name: "Century",
    blurb: "100 attempts at one target.", modes: [PRACTICE] },
  { id: "graduated", emoji: "\u{1F393}", name: "Graduated",
    blurb: "80%+ on a target, over at least 20 attempts.", modes: [PRACTICE] },
  { id: "two-sided", emoji: "\u{1F317}", name: "Two-sided",
    blurb: "Drilled two different targets in one session.", modes: [PRACTICE] },
  { id: "midnight-oil", emoji: "\u{1F56F}\uFE0F", name: "Burned the midnight oil",
    blurb: "A practice session of 50+ deliveries.", modes: [PRACTICE] },
];

// Can this badge be earned in this mode?
//
// The gate is on EARNING only. Every badge is always visible; this
// decides whether a night in a given mode can award it.
export function canEarnIn(badgeId, mode) {
  const b = COMPETITIVE_BADGES.find(x => x.id === badgeId);
  if (!b) return false;
  return b.modes.includes(mode);
}

// Every badge earnable in a mode. Used to tell someone why a slot is
// locked -- "only in league" is more useful than a grey square.
export function badgesForMode(mode) {
  return COMPETITIVE_BADGES.filter(b => b.modes.includes(mode));
}

// "League only", "League or tournament", "Practice only" -- the line
// shown under a locked badge.
export function whereEarnable(badgeId) {
  const b = COMPETITIVE_BADGES.find(x => x.id === badgeId);
  if (!b) return "";
  const names = { [LEAGUE]: "league", [TOURNAMENT]: "tournament", [PRACTICE]: "practice" };
  const list = b.modes.map(m => names[m]).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return `Earned in ${list[0]} only`;
  return `Earned in ${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}
