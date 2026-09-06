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

export function emptyTournamentGame(gameNumber = 1) {
  return { gameNumber, score: "", lanePair: "" };
}

export function emptyTournamentDay(dayNumber = 1) {
  return {
    dayNumber,
    date: "",
    blockNumber: "",
    startTime: "",
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
    id: "",
    bowler: "",
    name: "",
    center: "",
    days: [emptyTournamentDay(1)],
    buyIn: "",
    winnings: "",
    notes: "",
  };
}

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
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
    days,
    buyIn: raw.buyIn ?? "",
    winnings: raw.winnings ?? "",
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
    oilPattern: raw.oilPattern || "",
    games,
    cutLine: raw.cutLine ?? "",
    madeCut: raw.madeCut === true || raw.madeCut === false ? raw.madeCut : null,
    notes: raw.notes || "",
  };
}

// ── Game management ─────────────────────────────────────────────────────
export function addGame(day) {
  const games = day.games || [];
  return { ...day, games: [...games, emptyTournamentGame(games.length + 1)] };
}

export function removeGame(day, gameNumber) {
  const remaining = (day.games || []).filter(g => g.gameNumber !== gameNumber);
  // Renumber so game numbers stay contiguous after a removal from the middle.
  return { ...day, games: remaining.map((g, i) => ({ ...g, gameNumber: i + 1 })) };
}

export function setGameField(day, gameNumber, field, value) {
  return {
    ...day,
    games: (day.games || []).map(g => g.gameNumber === gameNumber ? { ...g, [field]: value } : g),
  };
}

// ── Day management ──────────────────────────────────────────────────────
export function addDay(tournament) {
  const days = tournament.days || [];
  return { ...tournament, days: [...days, emptyTournamentDay(days.length + 1)] };
}

export function removeDay(tournament, dayNumber) {
  const remaining = (tournament.days || []).filter(d => d.dayNumber !== dayNumber);
  const days = remaining.length ? remaining : [emptyTournamentDay(1)];
  return { ...tournament, days: days.map((d, i) => ({ ...d, dayNumber: i + 1 })) };
}

export function setDayField(tournament, dayNumber, field, value) {
  return {
    ...tournament,
    days: (tournament.days || []).map(d => d.dayNumber === dayNumber ? { ...d, [field]: value } : d),
  };
}

export function updateDay(tournament, dayNumber, updater) {
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
  const scores = (day?.games || []).map(g => num(g.score)).filter(v => v !== null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0);
}

export function dayGamesEntered(day) {
  return (day?.games || []).filter(g => num(g.score) !== null).length;
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
  return { buyIn, winnings, net: winnings - buyIn };
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
    notes: row.notes || "",
  });
}
