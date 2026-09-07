// Match play: the head-to-head phase after the cut.
//
// Qualifying is total pinfall. Match play is different -- you're drawn
// against one opponent per game, and most formats add BONUS PINS to your
// total for winning that game. A bowler can shoot lower than someone and
// still finish above them on bonus.
//
// The bonus is not standardised. 30 pins for a win is the most common
// figure and what the PBA and many USBC events use, but plenty of house
// and regional tournaments use 20, or 25, or none at all, and ties are
// sometimes worth half and sometimes nothing. Hardcoding 30 would quietly
// produce wrong standings at any event using something else, and the
// bowler would have no way to tell why the numbers didn't match the
// sheet. So both values are stored per tournament and editable, seeded
// with the common defaults rather than presented as fact.

export const DEFAULT_BONUS_PER_WIN = 30;
export const DEFAULT_BONUS_PER_TIE = 15;

export function emptyMatch(matchNumber = 1) {
  return {
    matchNumber,
    opponent: "",
    yourScore: "",
    opponentScore: "",
    // Lane pair matters in match play more than qualifying -- you're on
    // one pair with one opponent, and which pair often explains a result.
    lanePair: "",
  };
}

export function emptyMatchPlay() {
  return {
    bonusPerWin: String(DEFAULT_BONUS_PER_WIN),
    bonusPerTie: String(DEFAULT_BONUS_PER_TIE),
    matches: [],
  };
}

function num(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Same 0-300 guard the qualifying games use: outside that range it's a
// typo, and letting it through would corrupt a standing.
function gameScore(v) {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r < 0 || r > 300 ? null : r;
}

function bonus(v, fallback) {
  const n = num(v);
  if (n === null) return fallback;
  const r = Math.round(n);
  return r < 0 ? fallback : r;
}

export function normalizeMatch(raw, matchNumber = 1) {
  const base = emptyMatch(matchNumber);
  if (!raw || typeof raw !== "object") return base;
  const you = gameScore(raw.yourScore);
  const them = gameScore(raw.opponentScore);
  return {
    matchNumber: raw.matchNumber ?? matchNumber,
    opponent: (raw.opponent || "").trim(),
    yourScore: you === null ? "" : String(you),
    opponentScore: them === null ? "" : String(them),
    lanePair: (raw.lanePair || "").toString().trim(),
  };
}

export function normalizeMatchPlay(raw) {
  const base = emptyMatchPlay();
  if (!raw || typeof raw !== "object") return base;
  const matches = Array.isArray(raw.matches)
    ? raw.matches.map((m, i) => normalizeMatch(m, i + 1))
    : [];
  return {
    bonusPerWin: String(bonus(raw.bonusPerWin, DEFAULT_BONUS_PER_WIN)),
    bonusPerTie: String(bonus(raw.bonusPerTie, DEFAULT_BONUS_PER_TIE)),
    matches,
  };
}

export function addMatch(mp) {
  const base = normalizeMatchPlay(mp);
  return { ...base, matches: [...base.matches, emptyMatch(base.matches.length + 1)] };
}

export function removeMatch(mp, matchNumber) {
  const base = normalizeMatchPlay(mp);
  return {
    ...base,
    matches: base.matches
      .filter(m => m.matchNumber !== matchNumber)
      // Renumber so the list stays 1..n after a deletion from the middle.
      .map((m, i) => ({ ...m, matchNumber: i + 1 })),
  };
}

export function setMatchField(mp, matchNumber, field, value) {
  const base = normalizeMatchPlay(mp);
  return {
    ...base,
    matches: base.matches.map(m => (m.matchNumber === matchNumber ? { ...m, [field]: value } : m)),
  };
}

export function setBonus(mp, field, value) {
  const base = normalizeMatchPlay(mp);
  return { ...base, [field]: value };
}

// Result of one match. Returns null when either score is missing -- an
// unplayed or half-entered match is not a loss, and scoring it as one
// would understate a bowler mid-block.
export function matchResult(match) {
  const you = gameScore(match?.yourScore);
  const them = gameScore(match?.opponentScore);
  if (you === null || them === null) return null;
  if (you > them) return "win";
  if (you < them) return "loss";
  return "tie";
}

// Standings for the block: scratch pins, bonus earned, and the total that
// actually decides position.
export function matchPlayTotals(mp) {
  const base = normalizeMatchPlay(mp);
  const perWin = bonus(base.bonusPerWin, DEFAULT_BONUS_PER_WIN);
  const perTie = bonus(base.bonusPerTie, DEFAULT_BONUS_PER_TIE);

  let scratch = 0, wins = 0, losses = 0, ties = 0, played = 0;
  for (const m of base.matches) {
    const result = matchResult(m);
    if (result === null) continue;
    played += 1;
    scratch += gameScore(m.yourScore) ?? 0;
    if (result === "win") wins += 1;
    else if (result === "loss") losses += 1;
    else ties += 1;
  }

  const bonusPins = wins * perWin + ties * perTie;
  return {
    played,
    wins,
    losses,
    ties,
    scratch,
    bonusPins,
    total: scratch + bonusPins,
    // Average is over matches actually played, not matches listed.
    average: played ? Math.floor(scratch / played) : null,
    winPct: played ? Math.round((wins / played) * 100) : null,
    perWin,
    perTie,
  };
}

// Pin differential across the block -- how much you beat or lost to your
// opponents by, which says something win/loss alone doesn't. Losing five
// matches by two pins each is a very different block from losing five by
// forty.
export function pinDifferential(mp) {
  const base = normalizeMatchPlay(mp);
  let diff = 0, counted = 0;
  for (const m of base.matches) {
    if (matchResult(m) === null) continue;
    diff += (gameScore(m.yourScore) ?? 0) - (gameScore(m.opponentScore) ?? 0);
    counted += 1;
  }
  return counted ? diff : null;
}
