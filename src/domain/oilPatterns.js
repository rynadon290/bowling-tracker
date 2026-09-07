// Oil patterns.
//
// Seeded with real, named Kegel commercial patterns (Element, Landmark,
// Navigation series) -- see migration_oil_patterns.sql for exactly which
// entries were cross-verified against Kegel's own site versus taken from a
// single compiled source. Deliberately does NOT seed PBA tournament
// patterns: the same name gets reused year to year with different actual
// numbers, so there's no single stable spec to seed under one name. A
// bowler who wants to log one adds it by hand with whatever they were told.
//
// This is read/search-only from the app's side for the seeded rows --
// there's no voting or verification workflow like the ball catalog, since
// getting an oil pattern's length wrong is a much smaller stake than a
// ball's drilling spec, and the seed data already carries its own
// verification-level notes rather than needing community consensus.

export function normalizePattern(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = (raw.name || "").trim();
  if (!name) return null;
  return {
    id: raw.id || "",
    name,
    series: raw.series || "",
    lengthFeet: raw.lengthFeet ?? null,
    ratio: raw.ratio || "",
    volumeMl: raw.volumeMl ?? null,
    forwardMl: raw.forwardMl ?? null,
    reverseMl: raw.reverseMl ?? null,
    verified: !!raw.verified,
    sourceNote: raw.sourceNote || "",
  };
}

// A short line for showing under a pattern's name, e.g.
// "41' · Element Sport · 1.36:1 · 25.79 mL"
export function describePattern(pattern) {
  if (!pattern) return "";
  const parts = [];
  if (pattern.lengthFeet) parts.push(`${pattern.lengthFeet}'`);
  if (pattern.series) parts.push(pattern.series);
  if (pattern.ratio) parts.push(pattern.ratio);
  if (pattern.volumeMl) parts.push(`${pattern.volumeMl} mL`);
  return parts.join(" · ");
}

function key(name) {
  return (name || "").trim().toLowerCase();
}

// Search-as-you-type over the pattern library. Same ranking approach as
// the ball catalog's search: prefix matches before mid-string matches, so
// typing "Kry" surfaces "Krypton" before anything with "kry" buried in the
// middle of a longer name.
export function searchPatterns(query, patterns, limit = 8) {
  const q = key(typeof query === "string" ? query : "");
  if (q.length < 2) return [];
  const scored = (patterns || [])
    .map(normalizePattern)
    .filter(Boolean)
    .map(p => ({ pattern: p, idx: key(p.name).indexOf(q) }))
    .filter(x => x.idx !== -1);

  return scored
    .sort((a, b) => {
      const aPrefix = a.idx === 0 ? 0 : 1;
      const bPrefix = b.idx === 0 ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.pattern.name.localeCompare(b.pattern.name);
    })
    .slice(0, limit)
    .map(x => x.pattern);
}

// ── Supabase mapping ────────────────────────────────────────────────────
export function patternToRow(pattern, userId) {
  return {
    name: pattern.name,
    series: pattern.series || null,
    length_feet: pattern.lengthFeet || null,
    ratio: pattern.ratio || null,
    volume_ml: pattern.volumeMl || null,
    forward_ml: pattern.forwardMl || null,
    reverse_ml: pattern.reverseMl || null,
    verified: false, // a user submission is never auto-verified
    created_by: userId || null,
  };
}

export function patternFromRow(row) {
  if (!row) return null;
  return normalizePattern({
    id: row.id,
    name: row.name,
    series: row.series,
    lengthFeet: row.length_feet,
    ratio: row.ratio,
    volumeMl: row.volume_ml,
    forwardMl: row.forward_ml,
    reverseMl: row.reverse_ml,
    verified: row.verified,
    sourceNote: row.source_note,
  });
}

// ── Per-pattern history across tournaments ──────────────────────────────
//
// A bowler's real question is "how do I actually score on this pattern?"
// Tournament days each carry an oilPattern name and a set of games, so
// history is an aggregation across every day that names the same pattern.
//
// Matching is by normalized name, not id: a bowler may have logged the
// same pattern before it existed in the library (typed by hand) and again
// after picking it from the list. Those are the same pattern to them, so
// they aggregate together.
//
// Deliberately NOT computed here: strike percentage, carry, or anything
// needing shot-level data. Tournament days store game scores only, so
// score-derived stats are all that can honestly be produced. Shot-level
// pattern stats would need shots tagged with the pattern, which they
// aren't.

function scoresForDay(day) {
  return (day?.games || [])
    .map(g => (g.score === "" || g.score == null ? null : Number(g.score)))
    .filter(s => s != null && Number.isFinite(s) && s >= 0 && s <= 300);
}

// Every logged day matching a pattern name, flattened across tournaments.
export function patternDays(tournaments, patternName) {
  const target = key(patternName);
  if (!target) return [];
  const out = [];
  for (const t of (Array.isArray(tournaments) ? tournaments : [])) {
    for (const day of t?.days || []) {
      if (key(day?.oilPattern) !== target) continue;
      const scores = scoresForDay(day);
      out.push({
        tournamentId: t.id || "",
        tournamentName: t.name || "",
        center: t.center || "",
        date: day.date || "",
        dayNumber: day.dayNumber ?? null,
        scores,
        madeCut: day.madeCut === true || day.madeCut === false ? day.madeCut : null,
      });
    }
  }
  // Most recent first; days with no date sort last rather than pretending
  // to be the oldest.
  return out.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

// Aggregate stats for one pattern. Returns null when nothing is logged,
// so callers can hide the section rather than render a row of dashes.
export function patternStats(tournaments, patternName) {
  const days = patternDays(tournaments, patternName);
  const allScores = days.flatMap(d => d.scores);
  if (!allScores.length) {
    return days.length ? { days, games: 0, average: null, high: null, low: null, cutsMade: null, cutsTracked: 0 } : null;
  }
  const total = allScores.reduce((a, b) => a + b, 0);
  const tracked = days.filter(d => d.madeCut === true || d.madeCut === false);
  return {
    days,
    games: allScores.length,
    // Bowling averages truncate, they don't round -- same rule the book
    // average code follows.
    average: Math.floor(total / allScores.length),
    high: Math.max(...allScores),
    low: Math.min(...allScores),
    cutsMade: tracked.length ? tracked.filter(d => d.madeCut === true).length : null,
    cutsTracked: tracked.length,
  };
}

// Every pattern the bowler has actually logged, with its stats, ranked by
// how much they've played it. For a "your patterns" overview.
export function loggedPatternSummaries(tournaments) {
  const names = new Map();
  for (const t of (Array.isArray(tournaments) ? tournaments : [])) {
    for (const day of t?.days || []) {
      const name = (day?.oilPattern || "").trim();
      if (!name) continue;
      if (!names.has(key(name))) names.set(key(name), name);
    }
  }
  return [...names.values()]
    .map(name => ({ name, stats: patternStats(tournaments, name) }))
    .filter(x => x.stats)
    .sort((a, b) => {
      if (b.stats.games !== a.stats.games) return b.stats.games - a.stats.games;
      return a.name.localeCompare(b.name);
    });
}

// Per-pattern scoring, for Insights.
//
// 18/50 tournament players: "my Chameleon numbers and my house-shot
// numbers are two different bowlers." Blending them analyses a bowler who
// does not exist. The pattern library already knows what was down; this
// joins it to what was scored.
//
// Two sources, because a pattern is recorded differently in each:
//   - League nights: lanePatterns rows keyed by (league, date).
//   - Tournaments: the pattern is on the tournament day itself.
export function patternAverages(sessions, lanePatterns, tournaments, bowler) {
  const byPattern = new Map();

  function add(name, scores) {
    const clean = (Array.isArray(scores) ? scores : []).filter(v => Number.isFinite(v));
    if (!name || !clean.length) return;
    const key = String(name).trim();
    if (!key) return;
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key).push(...clean);
  }

  // League nights, matched on the night they were bowled.
  const patternByNight = new Map();
  for (const p of (Array.isArray(lanePatterns) ? lanePatterns : [])) {
    if (!p?.patternName) continue;
    patternByNight.set(`${p.league}|${p.date}`, p.patternName);
  }
  for (const s of (Array.isArray(sessions) ? sessions : [])) {
    if (!s || (bowler && s.bowler !== bowler)) continue;
    const name = patternByNight.get(`${s.league}|${s.date}`);
    if (name) add(name, s.scores);
  }

  // Tournament days carry their own pattern.
  for (const t of (Array.isArray(tournaments) ? tournaments : [])) {
    if (!t || (bowler && t.bowler && t.bowler !== bowler)) continue;
    for (const d of (Array.isArray(t.days) ? t.days : [])) {
      const scores = (Array.isArray(d?.games) ? d.games : [])
        .map(g => Number(g?.score))
        .filter(v => Number.isFinite(v));
      add(d?.oilPattern, scores);
    }
  }

  return [...byPattern.entries()]
    .map(([name, scores]) => ({
      name,
      games: scores.length,
      average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    }))
    .sort((a, b) => b.games - a.games);
}
