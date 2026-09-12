// Working out which competitive badges a bowler has earned.
//
// Separate from the definitions in competitiveBadges.js so the rules can
// be tested without a UI, and so a badge's CONDITIONS live next to each
// other rather than scattered across the screens that display them.
//
// THE MODE GATE IS APPLIED HERE, NOT IN THE UI.
//
// Every function takes the sessions/drills/matches for ONE mode and only
// awards badges canEarnIn() allows for it. A practice session cannot
// award a 300 no matter what is in it, because the practice evaluator
// never looks at scores at all.
//
// Counts and dates come from replaying nights in date order, the same way
// casualBadges.badgeHistory does -- a badge that turns on between night 4
// and night 5 was earned on night 5.

import { COMPETITIVE_BADGES, REPEATABLE, canEarnIn, LEAGUE, TOURNAMENT, PRACTICE } from "./competitiveBadges.js";
import { hangAssistCounts } from "./stats.js";
import { attempts, conversionRate } from "./drills.js";
import { isSplit } from "./splits.js";

const HONOR_GAME = 300;
const HONOR_SERIES = 800;

// Number(null) is 0, and 0 is finite -- so the obvious version of
// this returned 0 for null and every `!== null` guard downstream
// passed. A first night with no history "beat" a previous high of
// 0 and cleared an average of 0, awarding New high game, New high
// series and Heater to a bowler who had never bowled before.
//
// Null, undefined and empty string are absent, not zero.
const num = v => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const list = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === "object");

// ── One night, one mode ─────────────────────────────────────────────────
//
// Returns the badge ids a SINGLE night earns on its own. Season-long
// badges (Ironman, Old guard, Money bags) are not decided here -- they
// need the whole history and are handled below.

export function badgesFromLeagueNight(night, context) {
  const c = (context && typeof context === "object") ? context : {};
  const n = (night && typeof night === "object") ? night : {};
  const scores = (Array.isArray(n.scores) ? n.scores : []).map(num).filter(v => v !== null);
  if (!scores.length) return [];

  const out = new Set();
  const avg = num(c.average);
  const bookAvg = num(c.bookAverage);
  const series = scores.reduce((a, b) => a + b, 0);

  // Honor scores. League and tournament only -- never practice.
  //
  // A 300 is a 300 whatever the format -- one game, twelve strikes.
  //
  // An 800 is specifically a THREE-GAME SERIES. This summed however many
  // games were logged, so a longer set adding up to 800 would have
  // claimed an honor score that never happened. Exactly three, or it is
  // not a series.
  if (scores.some(v => v >= HONOR_GAME)) out.add("perfect-game");
  if (scores.length === 3 && series >= HONOR_SERIES) out.add("eight-hundred");


  // Scaled to the bowler, never a flat threshold.
  if (num(c.previousHighGame) !== null && Math.max(...scores) > num(c.previousHighGame)) out.add("new-high-game");
  if (num(c.previousHighSeries) !== null && series > num(c.previousHighSeries)) out.add("new-high-series");
  if (bookAvg !== null && scores.some(v => v - bookAvg >= 40)) out.add("book-buster");

  if (avg !== null) {
    if (scores.length >= 3 && scores.every(v => Math.abs(v - avg) <= 5)) out.add("in-the-pocket");
    // Three STRAIGHT games above average, not three of any games.
    for (let i = 0; i + 2 < scores.length; i++) {
      if (scores.slice(i, i + 3).every(v => v > avg)) { out.add("heater"); break; }
    }
    if (scores.length >= 2 && scores[0] < avg && scores[scores.length - 1] > avg) {
      out.add("cold-start-warm-finish");
    }
  }

  // Clean: every frame a strike or a spare, across the whole night.
  const shots = list(n.shots);
  if (shots.length) {
    const frames = shots.filter(s => !s.ballNum || s.ballNum === 1);
    if (frames.length >= 10 && frames.every(s => s.result === "Strike" || s.spareMade === "Yes")) {
      out.add("clean");
    }
    // Splits converted: a split leave that was then spared.
    let converted = 0;
    for (const s of shots) {
      try { if (isSplit(s) && s.spareMade === "Yes") converted++; } catch { /* not a split shot */ }
    }
    if (converted >= 3) out.add("sharp-shooter");
  }

  // Team results, from the night's match record.
  const match = (n.match && typeof n.match === "object") ? n.match : null;
  if (match && Array.isArray(match.games)) {
    const won = match.games.filter(v => v === true).length;
    const lost = match.games.filter(v => v === false).length;
    if (won > 0 && num(c.teamGameDifference) !== null && num(c.teamGameDifference) > 0) out.add("carried-it");
    if (lost > 0 && avg !== null && scores.some(v => v > avg)) out.add("held-the-line");
  }
  if (c.setTeamHighGame) out.add("team-high-game");
  if (c.setTeamHighSeries) out.add("team-high-series");

  // Money won tonight.
  if (num(c.moneyWonTonight) !== null && num(c.moneyWonTonight) > 0) out.add("cashed");

  return [...out].filter(id => canEarnIn(id, LEAGUE));
}

export function badgesFromTournamentDay(day, context) {
  const c = (context && typeof context === "object") ? context : {};
  const d = (day && typeof day === "object") ? day : {};
  const scores = (Array.isArray(d.scores) ? d.scores : []).map(num).filter(v => v !== null);
  const out = new Set();

  if (scores.length) {
    if (scores.some(v => v >= HONOR_GAME)) out.add("perfect-game");
    const total = scores.reduce((a, b) => a + b, 0);
    // Only when the block IS a three-game set. A six-game day totalling
    // 800 is not an 800 series, and calling it one would be wrong in
    // front of anyone who knows what the honor score means.
    if (scores.length === 3 && total >= HONOR_SERIES) out.add("eight-hundred");


    // Ramping up: EVERY step rises. Three flat games and one big one is
    // Strong finish, not a ramp -- they are different achievements and
    // the looser reading would collapse them into one.
    let run = 1, best = 1;
    for (let i = 1; i < scores.length; i++) {
      run = scores[i] > scores[i - 1] ? run + 1 : 1;
      best = Math.max(best, run);
    }
    if (best >= 3) out.add("ramping-up");

    // The average EXCLUDES the last game. Including it would let a big
    // finish inflate the bar it is measured against.
    if (scores.length >= 2) {
      const rest = scores.slice(0, -1);
      const restAvg = rest.reduce((a, b) => a + b, 0) / rest.length;
      if (scores[scores.length - 1] - restAvg >= 50) out.add("strong-finish");
    }
  }

  if (c.firstTournament) out.add("first-tournament");
  if (c.madeCut) out.add("made-the-cut");
  if (c.madeCut && num(c.cutMargin) !== null && num(c.cutMargin) <= 10) out.add("squeaked-in");
  if (num(c.placement) !== null && num(c.placement) <= 5) out.add("top-five");
  if (num(c.placement) === 1) out.add("won-it");
  if (num(c.sidePotWon) !== null && num(c.sidePotWon) > 0) out.add("cashed-side-pot");

  return [...out].filter(id => canEarnIn(id, TOURNAMENT));
}

// Practice earns drill badges and nothing else. This evaluator never
// looks at a score, which is what makes the rule structural rather than
// a filter someone can forget to apply.
export function badgesFromPracticeSession(drills, context) {
  const c = (context && typeof context === "object") ? context : {};
  const session = list(drills);
  const out = new Set();
  if (!session.length) return [];

  out.add("first-drill");

  const targets = new Set(session.map(d => d.target).filter(Boolean));
  if (targets.size >= 2) out.add("two-sided");

  const deliveries = session.reduce((a, d) => a + attempts(d), 0);
  if (deliveries >= 50) out.add("midnight-oil");

  // These need history rather than one session, supplied by the caller.
  if (num(c.sessionsOnTarget) !== null && num(c.sessionsOnTarget) >= 5) out.add("repeat-customer");
  if (num(c.lifetimeAttemptsOnTarget) !== null && num(c.lifetimeAttemptsOnTarget) >= 100) out.add("century");
  if (num(c.targetConversion) !== null && num(c.lifetimeAttemptsOnTarget) >= 20
      && num(c.targetConversion) >= 0.8) out.add("graduated");
  if (c.conversionRising) out.add("trending-up");

  return [...out].filter(id => canEarnIn(id, PRACTICE));
}

// ── Season-long badges ──────────────────────────────────────────────────
//
// Not decided by any single night, so they are worked out across the
// whole history at once.
export function seasonBadges(context) {
  const c = (context && typeof context === "object") ? context : {};
  const out = new Set();

  if (num(c.leagueNights) !== null && num(c.leagueNights) >= 1) out.add("league-first-night");
  if (num(c.seasonsCompleted) !== null && num(c.seasonsCompleted) >= 3) out.add("old-guard");
  if (c.bowledAsSub) out.add("sub-covered");
  if (num(c.currentAverage) !== null && num(c.lastSeasonBook) !== null
      && num(c.currentAverage) - num(c.lastSeasonBook) >= 5) out.add("raised-book-average");
  if (c.bookAverageConfirmed) out.add("locked-in");
  if (num(c.lifetimeMoneyWon) !== null && num(c.lifetimeMoneyWon) >= 100) out.add("money-bags");
  if (num(c.hangAssists) !== null && num(c.hangAssists) >= 30) out.add("executioner");

  return [...out].filter(id => canEarnIn(id, LEAGUE));
}

// ── Counts and dates ────────────────────────────────────────────────────
//
// Same shape casualBadges.badgeHistory returns, so a collection screen can
// render either pool without knowing which it has.
//
// A repeatable badge counts every night that earns it on its own. A
// one-off counts once, on the night it first appeared -- "earned 4 times"
// for "three full seasons" would be nonsense.
export function competitiveBadgeHistory(nights, evaluate, seasonIds) {
  const ordered = list(nights).slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  const out = {};
  for (const b of COMPETITIVE_BADGES) out[b.id] = { id: b.id, count: 0, lastDate: null };

  const fn = typeof evaluate === "function" ? evaluate : () => [];
  const seen = new Set();

  for (const night of ordered) {
    let earned = [];
    try { earned = fn(night) || []; } catch { earned = []; }
    for (const id of earned) {
      if (!out[id]) continue;
      if (REPEATABLE.has(id)) {
        out[id].count++;
        out[id].lastDate = night.date || out[id].lastDate;
      } else if (!seen.has(id)) {
        out[id].count = 1;
        out[id].lastDate = night.date || null;
        seen.add(id);
      }
    }
  }

  // Season badges have no single night to attribute, so they carry the
  // most recent night's date rather than a wrong one.
  const lastDate = ordered.length ? (ordered[ordered.length - 1].date || null) : null;
  for (const id of (Array.isArray(seasonIds) ? seasonIds : [])) {
    if (!out[id] || out[id].count) continue;
    out[id].count = 1;
    out[id].lastDate = lastDate;
  }

  return out;
}
