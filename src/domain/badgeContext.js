// Turning the app's state into what the badge evaluators expect.
//
// The evaluators in competitiveBadgeEarning.js take a night plus a
// CONTEXT -- your average, your previous high game, whether you set the
// team high. None of that is on a session row; it has to be worked out
// from the surrounding history. This is where that happens, so the
// component stays a renderer and the arithmetic stays testable.
//
// Deliberately: "previous" means BEFORE the night being scored. A new
// high game has to beat what you had walking in, not what you had after
// bowling it -- otherwise every night's best game beats itself and the
// badge fires constantly.

import {
  badgesFromLeagueNight, badgesFromTournamentDay, badgesFromPracticeSession,
  seasonBadges, competitiveBadgeHistory,
} from "./competitiveBadgeEarning.js";
import { hangAssistCounts } from "./stats.js";
import { totalMoney, sessionMoney } from "./money.js";
import { attempts, conversionRate } from "./drills.js";

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
const rows = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === "object");
const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));

// Sessions for one bowler in one league, oldest first.
function myNights(sessions, bowler, league) {
  return rows(sessions)
    .filter(s => s.bowler === bowler && (!league || s.league === league))
    .slice().sort(byDate);
}

// Everything a league night needs to be judged, using only what was
// known BEFORE it.
export function leagueNightContext(night, priorNights, extras) {
  const e = (extras && typeof extras === "object") ? extras : {};
  const prior = rows(priorNights);
  const priorScores = prior.flatMap(n => (Array.isArray(n.scores) ? n.scores : []).map(num).filter(v => v !== null));

  const priorSeries = prior
    .map(n => (Array.isArray(n.scores) ? n.scores : []).map(num).filter(v => v !== null))
    .filter(s => s.length)
    .map(s => s.reduce((a, b) => a + b, 0));

  return {
    average: priorScores.length ? priorScores.reduce((a, b) => a + b, 0) / priorScores.length : null,
    bookAverage: num(e.bookAverage),
    previousHighGame: priorScores.length ? Math.max(...priorScores) : null,
    previousHighSeries: priorSeries.length ? Math.max(...priorSeries) : null,
    teamGameDifference: num(e.teamGameDifference),
    setTeamHighGame: !!e.setTeamHighGame,
    setTeamHighSeries: !!e.setTeamHighSeries,
    fullRoster: !!e.fullRoster,
    moneyWonTonight: num(e.moneyWonTonight),
  };
}

// A bowler's whole competitive badge picture.
//
// Returns the same {id: {count, lastDate}} shape casualBadges produces,
// so one collection screen renders either pool.
export function competitiveBadges(args) {
  // Destructured in the BODY. `= {}` defaults an OMITTED argument only --
  // passed an explicit null it throws on the parameter list before a line
  // of this function runs. Fourth time this exact trap has bitten in this
  // codebase, which is why chunkReload.js and badgeShare.js say the same.
  const a = (args && typeof args === "object") ? args : {};
  const sessions = a.sessions, shots = a.shots, matches = a.matches, drills = a.drills;
  const bowler = typeof a.bowler === "string" ? a.bowler : "";
  const league = typeof a.league === "string" ? a.league : "";
  const profile = a.profile;
  const nights = myNights(sessions, bowler, league);

  // Match records keyed the way getMatch looks them up.
  const matchFor = date => rows(matches).find(m => m.date === date && (!league || m.league === league)) || null;

  // Money is per session; a night "cashed" if it netted anything.
  const moneyFor = date => {
    const s = nights.find(n => n.date === date);
    if (!s) return null;
    try { return sessionMoney(s)?.gross ?? null; } catch { return null; }
  };

  const evaluate = night => {
    const prior = nights.filter(n => String(n.date) < String(night.date));
    const ctx = leagueNightContext(night, prior, {
      bookAverage: profile?.bookAverage,
      moneyWonTonight: moneyFor(night.date),
    });
    return badgesFromLeagueNight({
      ...night,
      shots: rows(shots).filter(s => s.bowler === bowler && s.date === night.date
        && (!league || s.league === league)),
      match: matchFor(night.date),
    }, ctx);
  };

  // Season-long badges, from the whole history rather than any one night.
  let lifetimeMoney = null;
  try { lifetimeMoney = totalMoney(nights)?.gross ?? null; } catch { lifetimeMoney = null; }

  const assists = (() => {
    try { return hangAssistCounts(shots, league)[bowler] ?? 0; } catch { return 0; }
  })();

  const season = seasonBadges({
    leagueNights: nights.length,
    lifetimeMoneyWon: lifetimeMoney,
    hangAssists: assists,
    currentAverage: (() => {
      const all = nights.flatMap(n => (Array.isArray(n.scores) ? n.scores : []).map(num).filter(v => v !== null));
      return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    })(),
    lastSeasonBook: num(profile?.bookAverage),
    bookAverageConfirmed: !!profile?.bookAverageConfirmed,
  });

  return competitiveBadgeHistory(nights, evaluate, season);
}

// Practice badges, from drill history alone. Never sees a score.
export function practiceBadges(args) {
  const a = (args && typeof args === "object") ? args : {};
  const drills = a.drills;
  const bowler = typeof a.bowler === "string" ? a.bowler : "";
  const mine = rows(drills).filter(d => d.bowler === bowler).slice().sort(byDate);
  if (!mine.length) return competitiveBadgeHistory([], () => [], []);

  // Grouped by session date, since "a session" is what earns most of
  // these -- two targets in one session, 50 deliveries in one session.
  const sessions = {};
  for (const d of mine) (sessions[d.date] = sessions[d.date] || []).push(d);

  const nights = Object.keys(sessions).sort().map(date => ({ date }));

  const evaluate = night => {
    const session = sessions[night.date] || [];
    // Per-target history up to and including this session.
    const upTo = mine.filter(d => String(d.date) <= String(night.date));
    const targets = [...new Set(session.map(d => d.target).filter(Boolean))];

    let best = { sessions: 0, lifetime: 0, conversion: null };
    for (const t of targets) {
      const onTarget = upTo.filter(d => d.target === t);
      const lifetime = onTarget.reduce((a, d) => a + attempts(d), 0);
      const made = onTarget.reduce((a, d) => a + (num(d.made) || 0), 0);
      const sessionCount = new Set(onTarget.map(d => d.date)).size;
      if (lifetime > best.lifetime) {
        best = { sessions: sessionCount, lifetime, conversion: lifetime ? made / lifetime : null };
      }
    }

    return badgesFromPracticeSession(session, {
      sessionsOnTarget: best.sessions,
      lifetimeAttemptsOnTarget: best.lifetime,
      targetConversion: best.conversion,
      conversionRising: false,
    });
  };

  return competitiveBadgeHistory(nights, evaluate, []);
}

// League and practice merged into one picture. Both pools always show;
// only earning is gated by mode.
export function allCompetitiveBadges(args) {
  const a = (args && typeof args === "object") ? args : {};
  const league = competitiveBadges(a);
  const practice = practiceBadges(a);
  const out = { ...league };
  for (const [id, rec] of Object.entries(practice)) {
    if (rec && rec.count) out[id] = rec;
  }
  return out;
}
