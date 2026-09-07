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
  const q = key(query);
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
