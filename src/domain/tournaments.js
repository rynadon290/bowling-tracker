// Tournament sessions.
//
// A tournament night is shaped differently enough from a league night that
// it gets its own record rather than being forced into `sessions`:
//
//   - Game count varies. Leagues are 3; tournaments might be 4, 6, 8, or an
//     odd number for a squad. Nothing here assumes 3.
//   - Lane pair changes per game. Tournaments move you after every game, so
//     the pair belongs to the GAME, not the session.
//   - It can span multiple days, each with its own cut line -- surviving day
//     one says nothing about day two.
//   - Scores are usually entered as finished games. Shot-by-shot logging is
//     impractical when you're moving pairs and racing a squad clock.
//
// Cut lines are the interesting part. A cut line is a total to beat, and
// what matters is your margin against it: positive is above the cut (good),
// negative is how far you'd need to make up. Whether you ACTUALLY made the
// cut is a separate recorded fact, because the posted line can shift and is
// often only final once the squad finishes.

import { normalizeSidePots, sidePotTotals } from "./sidePots.js";
import { normalizeMatchPlay, emptyMatchPlay, matchPlayTotals } from "./matchPlay.js";

export function emptyTournamentGame(gameNumber = 1) {
  return { gameNumber, score: "", lanePair: "" };
}

export function emptyTournamentDay(dayNumber = 1) {
  return {
    dayNumber,
    date: "",
    blockNumber: "",
    startTime: "",
    // Squad scheduling: which squad and where you're assigned. startTime
    // above is when it begins; these say which one and which pair.
    squad: "",
    startingLanes: "",
    oilPattern: "",
    games: [emptyTournamentGame(1)],
    cutLine: "",
    // null = not yet known (the usual state until the squad finishes)
    madeCut: null,
    notes: "",
  };
}

export function emptyTournament() {
  return {
    // Recorded, not computed -- scores alone cannot show a win.
    placement: "",
    placementNote: "",
    id: "",
    bowler: "",
    name: "",
    center: "",
    days: [emptyTournamentDay(1)],
    buyIn: "",
    winnings: "",
    // Itemised side action, separate from the main entry above.
    sidePots: [],
    // The head-to-head phase after the cut. Empty until a bowler makes it
    // -- most tournaments end at qualifying for most bowlers.
    matchPlay: emptyMatchPlay(),
    notes: "",
  };
}

function num(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// A bowling game is 0-300. Anything outside that isn't a score, it's a
// typo -- and letting it through would corrupt a tournament total.
function gameScore(v) {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r < 0 || r > 300 ? null : r;
}

export function normalizeTournament(raw) {
  const base = emptyTournament();
  if (!raw || typeof raw !== "object") return base;
  const days = Array.isArray(raw.days) && raw.days.length
    ? raw.days.map((d, i) => normalizeTournamentDay(d, i + 1))
    : base.days;
  return {
    id: raw.id || "",
    bowler: raw.bowler || "",
    name: raw.name || "",
    center: raw.center || "",
    // Listed here as well as in emptyTournament: this function rebuilds
    // the object field by field, so anything missing HERE is dropped on
    // every save.
    placement: raw.placement || "",
    placementNote: raw.placementNote || "",
    days,
    buyIn: raw.buyIn ?? "",
    winnings: raw.winnings ?? "",
    sidePots: normalizeSidePots(raw.sidePots),
    matchPlay: normalizeMatchPlay(raw.matchPlay),
    notes: raw.notes || "",
  };
}

export function normalizeTournamentDay(raw, dayNumber = 1) {
  const base = emptyTournamentDay(dayNumber);
  if (!raw || typeof raw !== "object") return base;
  const games = Array.isArray(raw.games) && raw.games.length
    ? raw.games.map((g, i) => ({
        gameNumber: i + 1,
        score: g?.score ?? "",
        lanePair: g?.lanePair ?? "",
      }))
    : base.games;
  return {
    dayNumber: raw.dayNumber ?? dayNumber,
    date: raw.date || "",
    blockNumber: raw.blockNumber ?? "",
    startTime: raw.startTime || "",
    squad: raw.squad || "",
    startingLanes: raw.startingLanes || "",
    oilPattern: raw.oilPattern || "",
    games,
    cutLine: raw.cutLine ?? "",
    madeCut: raw.madeCut === true || raw.madeCut === false ? raw.madeCut : null,
    notes: raw.notes || "",
  };
}

// ── Game management ─────────────────────────────────────────────────────
// Every updater below takes a tournament or a day and returns a new one.
// Handed something that is not an object -- state before it loads, a
// null from the cloud -- they used to throw on `.days` or `.games`.
//
// They now return the input UNTOUCHED. Not an invented empty
// tournament: fabricating a shape here would hide the real problem
// further downstream, where an empty tournament looks like a real one
// the bowler deleted.
function isRecord(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

export function addGame(day) {
  if (!isRecord(day)) return day;
  const games = day.games || [];
  return { ...day, games: [...games, emptyTournamentGame(games.length + 1)] };
}

export function removeGame(day, gameNumber) {
  if (!isRecord(day)) return day;
  const remaining = (day.games || []).filter(g => g.gameNumber !== gameNumber);
  // Renumber so game numbers stay contiguous after a removal from the middle.
  return { ...day, games: remaining.map((g, i) => ({ ...g, gameNumber: i + 1 })) };
}

export function setGameField(day, gameNumber, field, value) {
  if (!isRecord(day)) return day;
  return {
    ...day,
    games: (day.games || []).map(g => g.gameNumber === gameNumber ? { ...g, [field]: value } : g),
  };
}

// ── Day management ──────────────────────────────────────────────────────
export function addDay(tournament) {
  if (!isRecord(tournament)) return tournament;
  const days = tournament.days || [];
  return { ...tournament, days: [...days, emptyTournamentDay(days.length + 1)] };
}

export function removeDay(tournament, dayNumber) {
  if (!isRecord(tournament)) return tournament;
  const remaining = (tournament.days || []).filter(d => d.dayNumber !== dayNumber);
  const days = remaining.length ? remaining : [emptyTournamentDay(1)];
  return { ...tournament, days: days.map((d, i) => ({ ...d, dayNumber: i + 1 })) };
}

export function setDayField(tournament, dayNumber, field, value) {
  if (!isRecord(tournament)) return tournament;
  return {
    ...tournament,
    days: (tournament.days || []).map(d => d.dayNumber === dayNumber ? { ...d, [field]: value } : d),
  };
}

export function updateDay(tournament, dayNumber, updater) {
  if (!isRecord(tournament)) return tournament;
  return {
    ...tournament,
    days: (tournament.days || []).map(d => d.dayNumber === dayNumber ? updater(d) : d),
  };
}

// ── Totals and cut ──────────────────────────────────────────────────────
// Only games with an entered score count. A blank game is one not yet
// bowled, not a zero -- treating it as zero would make a running total
// during a block look catastrophic.
export function dayTotal(day) {
  const scores = (day?.games || []).map(g => gameScore(g.score)).filter(v => v !== null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0);
}

export function dayGamesEntered(day) {
  return (day?.games || []).filter(g => gameScore(g.score) !== null).length;
}

export function dayAverage(day) {
  const total = dayTotal(day);
  const n = dayGamesEntered(day);
  return total === null || n === 0 ? null : total / n;
}

// Margin against the day's cut line. Positive = above the cut.
// Returns null when either side is unknown, so the UI can stay quiet
// rather than implying a standing that isn't real yet.
export function cutMargin(day) {
  const total = dayTotal(day);
  const cut = num(day?.cutLine);
  if (total === null || cut === null) return null;
  return total - cut;
}

export function tournamentTotal(tournament) {
  const totals = (tournament?.days || []).map(dayTotal).filter(v => v !== null);
  if (!totals.length) return null;
  return totals.reduce((a, b) => a + b, 0);
}

export function tournamentGamesEntered(tournament) {
  return (tournament?.days || []).reduce((a, d) => a + dayGamesEntered(d), 0);
}

export function tournamentAverage(tournament) {
  const total = tournamentTotal(tournament);
  const n = tournamentGamesEntered(tournament);
  return total === null || n === 0 ? null : total / n;
}

// Net money. Buy-in is a cost, winnings are a return; blank counts as zero
// here (unlike scores) because "didn't pay" and "paid nothing" are the same.
export function tournamentMoney(tournament) {
  const buyIn = num(tournament?.buyIn) ?? 0;
  const winnings = num(tournament?.winnings) ?? 0;
  const side = sidePotTotals(tournament?.sidePots);
  // entryNet and net are both reported: the first answers "was the
  // tournament itself worth entering", the second "did I leave up".
  // Collapsing them would hide a bowler who cashes the main event every
  // week and gives it all back in brackets.
  const entryNet = Math.round((winnings - buyIn) * 100) / 100;
  return {
    buyIn,
    winnings,
    entryNet,
    side,
    totalCost: Math.round((buyIn + side.cost) * 100) / 100,
    totalWon: Math.round((winnings + side.won) * 100) / 100,
    net: Math.round((entryNet + side.net) * 100) / 100,
  };
}

// Qualifying total plus the match-play block, which is what actually
// decides a finish at events that have one.
export function tournamentFinalTotal(tournament) {
  const qualifying = tournamentTotal(tournament);
  const mp = matchPlayTotals(tournament?.matchPlay);
  if (!mp.played) return { qualifying, matchPlay: null, total: qualifying };
  return { qualifying, matchPlay: mp, total: qualifying + mp.total };
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function tournamentToRow(t, userId) {
  return {
    id: t.id,
    user_id: userId,
    bowler_name: t.bowler,
    name: t.name,
    center: t.center || null,
    days: t.days || [],
    buy_in: num(t.buyIn),
    winnings: num(t.winnings),
    side_pots: normalizeSidePots(t.sidePots),
    match_play: normalizeMatchPlay(t.matchPlay),
    notes: t.notes || null,
  };
}

export function tournamentFromRow(row) {
  if (!row) return null;
  return normalizeTournament({
    id: row.id,
    bowler: row.bowler_name || "",
    name: row.name || "",
    center: row.center || "",
    days: row.days || [],
    buyIn: row.buy_in == null ? "" : String(row.buy_in),
    winnings: row.winnings == null ? "" : String(row.winnings),
    sidePots: row.side_pots || [],
    matchPlay: row.match_play || null,
    notes: row.notes || "",
  });
}
