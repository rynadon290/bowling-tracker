// Bracket and side-pot money.
//
// A tournament's buyIn/winnings pair covers the main entry only. Side
// action is a different thing: a bowler might put $5 into each of four
// brackets, $10 into an eliminator, and $20 into the scratch pot, and cash
// two of them. Folding all of that into one "winnings" figure answers
// "did I come out ahead tonight" but destroys the more useful question --
// which of these actually pays for itself over a season.
//
// So each entry is itemised. The main entry stays where it is; this sits
// alongside it, and the tournament's overall net is the sum of both.
//
// Deliberately NOT modelled: bracket ladders (who you were drawn against,
// round by round). A bracket's outcome is "I cashed or I didn't" plus how
// much -- the bracket sheet itself lives on the wall at the desk, and
// re-entering it by hand on a phone between squads is not something anyone
// would keep up.

export const SIDE_POT_TYPES = ["Bracket", "Eliminator", "Side Pot", "Jackpot", "Optional"];

export function emptySidePot(type = "Bracket") {
  return {
    id: "",
    type,
    label: "",
    // Brackets are usually bought several at a time at the same price, so
    // entries x cost is the natural way in rather than a single total the
    // bowler has to do arithmetic for.
    entries: "1",
    costPerEntry: "",
    winnings: "",
  };
}

function num(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Money is dollars and cents; entries are whole things you bought.
function money(v) {
  const n = num(v);
  if (n === null) return null;
  if (n < 0) return null; // a negative buy-in isn't a thing
  return Math.round(n * 100) / 100;
}

function count(v) {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r < 0 ? null : r;
}

export function normalizeSidePot(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const type = SIDE_POT_TYPES.includes(raw.type) ? raw.type : "Bracket";
  return {
    id: raw.id || `sp-${index}`,
    type,
    label: (raw.label || "").trim(),
    entries: raw.entries === "" || raw.entries == null ? "" : String(count(raw.entries) ?? ""),
    costPerEntry: raw.costPerEntry === "" || raw.costPerEntry == null ? "" : String(money(raw.costPerEntry) ?? ""),
    winnings: raw.winnings === "" || raw.winnings == null ? "" : String(money(raw.winnings) ?? ""),
  };
}

export function normalizeSidePots(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((p, i) => normalizeSidePot(p, i)).filter(Boolean);
}

export function addSidePot(pots, type = "Bracket") {
  const list = Array.isArray(pots) ? pots : [];
  return [...list, { ...emptySidePot(type), id: `sp-${Date.now()}-${list.length}` }];
}

export function removeSidePot(pots, id) {
  // Null ELEMENTS, not just a null list.
  //
  // Array.isArray() says the container is a list and nothing about
  // what is in it. A half-written row, a partial import, a merge that
  // dropped something -- any of them puts a null in here, and the
  // property access two lines down took a whole screen with it.
  pots = (Array.isArray(pots) ? pots : []).filter(x => x && typeof x === "object");
  return (Array.isArray(pots) ? pots : []).filter(p => p.id !== id);
}

export function setSidePotField(pots, id, field, value) {
  // Null ELEMENTS, not just a null list.
  //
  // Array.isArray() says the container is a list and nothing about
  // what is in it. A half-written row, a partial import, a merge that
  // dropped something -- any of them puts a null in here, and the
  // property access two lines down took a whole screen with it.
  pots = (Array.isArray(pots) ? pots : []).filter(x => x && typeof x === "object");
  return (Array.isArray(pots) ? pots : []).map(p => (p.id === id ? { ...p, [field]: value } : p));
}

// Cost and return for a single entry.
export function sidePotMoney(pot) {
  const entries = count(pot?.entries) ?? 0;
  const per = money(pot?.costPerEntry) ?? 0;
  const cost = Math.round(entries * per * 100) / 100;
  const won = money(pot?.winnings) ?? 0;
  return { cost, won, net: Math.round((won - cost) * 100) / 100 };
}

// Totals across every side entry, plus a per-type breakdown -- the
// breakdown is the point of itemising in the first place.
export function sidePotTotals(pots) {
  const list = normalizeSidePots(pots);
  let cost = 0, won = 0;
  const byType = {};
  for (const pot of (Array.isArray(list) ? list : [])) {
    const m = sidePotMoney(pot);
    cost += m.cost;
    won += m.won;
    if (!byType[pot.type]) byType[pot.type] = { type: pot.type, entries: 0, cost: 0, won: 0, net: 0, cashed: 0, count: 0 };
    const b = byType[pot.type];
    b.count += 1;
    b.entries += count(pot.entries) ?? 0;
    b.cost = Math.round((b.cost + m.cost) * 100) / 100;
    b.won = Math.round((b.won + m.won) * 100) / 100;
    b.net = Math.round((b.won - b.cost) * 100) / 100;
    if (m.won > 0) b.cashed += 1;
  }
  cost = Math.round(cost * 100) / 100;
  won = Math.round(won * 100) / 100;
  return {
    cost,
    won,
    net: Math.round((won - cost) * 100) / 100,
    count: list.length,
    byType: Object.values(byType),
  };
}
