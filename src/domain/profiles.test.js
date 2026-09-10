import { describe, it, expect } from 'vitest';
import {
  emptyProfile, normalizeProfile, resolveHandedness, addHomeCenter,
  removeHomeCenter, profileToRow, profileFromRow, membershipFor,
  resolveHomeCenters, suggestBookAverage,
  normalizeAliases,
} from './profiles.js';

function games(bowler, league, scores) {
  return scores.map((score, i) => ({ bowler, league, date: `2026-0${(i % 9) + 1}-01`, scores: [score], total: score }));
}

describe('suggestBookAverage', () => {
  it('is ineligible with no sessions at all', () => {
    expect(suggestBookAverage([], 'Ryan').eligible).toBe(false);
  });

  it('requires at least 21 games in a single league', () => {
    const twenty = games('Ryan', 'Thursday', Array(20).fill(200));
    expect(suggestBookAverage(twenty, 'Ryan').eligible).toBe(false);

    const twentyOne = games('Ryan', 'Thursday', Array(21).fill(200));
    const r = suggestBookAverage(twentyOne, 'Ryan');
    expect(r.eligible).toBe(true);
    expect(r.suggested).toBe(200);
  });

  it('truncates rather than rounds, matching USBC convention', () => {
    // 20 games at 214 and one at 213 averages to 213.952... -- a book
    // average is total pinfall over games with the remainder DROPPED, so
    // this must suggest 213, never 214.
    const sessions = games('Ryan', 'Thursday', [...Array(20).fill(214), 213]);
    expect(suggestBookAverage(sessions, 'Ryan').suggested).toBe(213);
  });

  it('picks the stronger qualifying league over a weak composite', () => {
    const sessions = [
      ...games('Ryan', 'Thursday', Array(25).fill(220)),
      ...games('Ryan', 'Tuesday', Array(5).fill(150)),
    ];
    const r = suggestBookAverage(sessions, 'Ryan');
    expect(r.suggested).toBe(220);
    expect(r.basis).toContain('Thursday');
  });

  it('picks the composite when no single league reaches 21 games but the total does', () => {
    const sessions = [
      ...games('Ryan', 'Thursday', Array(11).fill(200)),
      ...games('Ryan', 'Tuesday', Array(11).fill(200)),
    ];
    const r = suggestBookAverage(sessions, 'Ryan');
    expect(r.eligible).toBe(true);
    expect(r.suggested).toBe(200);
  });

  it('is ineligible when neither a single league nor the composite reaches 21 games', () => {
    const sessions = [
      ...games('Ryan', 'Thursday', Array(8).fill(200)),
      ...games('Ryan', 'Tuesday', Array(8).fill(200)),
    ];
    expect(suggestBookAverage(sessions, 'Ryan').eligible).toBe(false);
  });

  it('scopes to the requested bowler only', () => {
    const sessions = [
      ...games('Ryan', 'Thursday', Array(25).fill(200)),
      ...games('Aaron', 'Thursday', Array(25).fill(100)),
    ];
    expect(suggestBookAverage(sessions, 'Ryan').suggested).toBe(200);
  });

  it('never writes to a profile -- it only returns a suggestion', () => {
    // Book average is static by design; nothing about calling this
    // function should mutate stored data. This is really a documentation
    // test: suggestBookAverage takes sessions and a name, nothing else,
    // and returns a plain object.
    const sessions = games('Ryan', 'Thursday', Array(21).fill(200));
    const r = suggestBookAverage(sessions, 'Ryan');
    expect(typeof r).toBe('object');
    expect(r).not.toHaveProperty('bookAverage');
  });
});

describe('normalizeProfile', () => {
  it('returns a complete profile for missing input rather than throwing', () => {
    expect(normalizeProfile(null, 'Ryan')).toEqual(emptyProfile('Ryan'));
  });

  it('coerces a malformed homeCenters value to an empty list', () => {
    expect(normalizeProfile({ homeCenters: 'not-an-array' }, 'Ryan').homeCenters).toEqual([]);
  });

  it('trims center names and drops blank entries', () => {
    const p = normalizeProfile({ homeCenters: ['  Bowlero  ', '', '   '] }, 'Ryan');
    expect(p.homeCenters).toEqual(['Bowlero']);
  });
});

describe('resolveHandedness', () => {
  // Handedness lived on team_members before profiles existed. Both sources
  // are still present, so resolution order matters for every existing bowler.
  it('prefers the profile over the roster value', () => {
    const lefty = { ...emptyProfile('Ryan'), leftHanded: true };
    expect(resolveHandedness(lefty, false)).toBe(true);
  });

  it('lets a right-handed profile override a stale left-handed roster entry', () => {
    expect(resolveHandedness(emptyProfile('Ryan'), true)).toBe(false);
  });

  it('falls back to the roster when no profile exists yet', () => {
    // This is what keeps existing bowlers working before anyone fills in
    // a profile -- without it, every lefty would silently become a righty.
    expect(resolveHandedness(null, true)).toBe(true);
  });

  it('defaults to right-handed when neither source knows', () => {
    expect(resolveHandedness(null, undefined)).toBe(false);
  });
});

describe('home centers', () => {
  const centers = [
    { id: 'c1', name: 'Arsenal Bowl', city: 'Pittsburgh', state: 'PA' },
    { id: 'c2', name: 'Bowlero Pittsburgh', city: 'Pittsburgh', state: 'PA' },
  ];

  it('stores centers by shared id, not by name', () => {
    // Storing the id means a bowler's home house is the same row every
    // other bowler references, so per-center stats aggregate instead of
    // fragmenting across spellings.
    expect(addHomeCenter(emptyProfile('Ryan'), 'c1').homeCenters).toEqual(['c1']);
  });

  it('will not add the same center twice', () => {
    const p = addHomeCenter(addHomeCenter(emptyProfile('Ryan'), 'c1'), 'c1');
    expect(p.homeCenters).toEqual(['c1']);
  });

  it('ignores a blank id', () => {
    expect(addHomeCenter(emptyProfile('Ryan'), '').homeCenters).toEqual([]);
  });

  it('removes a center', () => {
    const p = addHomeCenter(emptyProfile('Ryan'), 'c1');
    expect(removeHomeCenter(p, 'c1').homeCenters).toEqual([]);
  });

  it('resolves stored ids to real centers', () => {
    const p = addHomeCenter(addHomeCenter(emptyProfile('Ryan'), 'c1'), 'c2');
    expect(resolveHomeCenters(p, centers).map(c => c.name))
      .toEqual(['Arsenal Bowl', 'Bowlero Pittsburgh']);
  });

  it('drops an id with no matching center rather than showing a raw uuid', () => {
    const p = addHomeCenter(emptyProfile('Ryan'), 'deleted-id');
    expect(resolveHomeCenters(p, centers)).toEqual([]);
  });
});

describe('supabase round trip', () => {
  it('preserves every field in both directions', () => {
    const full = {
      bowlerName: 'Ryan', leftHanded: true, twoHanded: true, isCoach: false, aliases: [],
      homeCenters: ['Bowlero'], notes: 'thumb tape',
      bookAverage: '213', allTimeHighGame: '279', allTimeHighSeries: '742',
      bookGames: '90', bookSeason: '2025-26 Winter', bookAverageAsOf: '2026-08-01',
    };
    expect(profileFromRow(profileToRow(full, 'user-1'))).toEqual(full);
  });

  // The case above carries isCoach: false, which would still pass if the
  // flag were dropped entirely on the way through -- false is also what a
  // missing value normalizes to. This one proves the column actually
  // survives the round trip.
  it('preserves the coach flag when it is set', () => {
    const coach = {
      bowlerName: 'Dave', leftHanded: false, twoHanded: false, isCoach: true, aliases: [],
      homeCenters: [], notes: '',
      bookAverage: '', allTimeHighGame: '', allTimeHighSeries: '',
      bookGames: '', bookSeason: '', bookAverageAsOf: '',
    };
    expect(profileToRow(coach, 'user-1').is_coach).toBe(true);
    expect(profileFromRow(profileToRow(coach, 'user-1'))).toEqual(coach);
  });

  it('treats a row from before the coach column as not a coach', () => {
    expect(profileFromRow({ bowler_name: 'Old' }).isCoach).toBe(false);
  });

  it('round-trips a profile with no book average as blanks, not NaN', () => {
    // A profile built before these fields existed has them undefined.
    // Number(undefined) is NaN, which Postgres rejects -- so the row must
    // carry null, and the round trip must come back as "".
    const legacy = { bowlerName: 'Ryan', leftHanded: false, twoHanded: false, homeCenters: [], notes: '' };
    const row = profileToRow(legacy, 'user-1');
    expect(row.book_average).toBeNull();
    expect(row.book_games).toBeNull();
    expect(profileFromRow(row).bookAverage).toBe('');
  });

  it('returns null for a missing row', () => {
    expect(profileFromRow(null)).toBeNull();
  });
});

describe('membershipFor', () => {
  const teams = [
    { id: 't1', name: 'Gutter Kings', league: 'Thursday House Shot', members: ['Ryan', 'Aaron'] },
    { id: 't2', name: 'Split Happens', league: 'Tuesday House Shot', members: ['Ryan', 'Lee'] },
    { id: 't3', name: 'Other', league: 'Thursday House Shot', members: ['Zack'] },
  ];

  it('derives teams and leagues from the roster rather than storing them', () => {
    // Duplicating membership onto the profile would let the two drift apart.
    const m = membershipFor('Ryan', teams);
    expect(m.teams.map(t => t.name)).toEqual(['Gutter Kings', 'Split Happens']);
    expect(m.leagues).toEqual(['Thursday House Shot', 'Tuesday House Shot']);
  });

  it('returns empty membership for a bowler on no teams', () => {
    expect(membershipFor('Nobody', teams).teams).toEqual([]);
  });

  it('tolerates a missing teams list', () => {
    expect(membershipFor('Ryan', null).teams).toEqual([]);
  });
});

describe('scorecard aliases', () => {
  it('trims, dedupes case-insensitively, and drops blanks', () => {
    expect(normalizeAliases([' R. Nadon ', 'RYAN N', 'r. nadon', '', null])).toEqual(['R. Nadon', 'RYAN N']);
  });

  it('caps the list -- a matching aid, not a typo archive', () => {
    expect(normalizeAliases(Array.from({ length: 20 }, (_, i) => `name${i}`))).toHaveLength(8);
  });

  it('round-trips through a row', () => {
    const p = normalizeProfile({ bowlerName: 'Ryan', aliases: ['R. Nadon'] });
    expect(profileFromRow(profileToRow(p, 'u1')).aliases).toEqual(['R. Nadon']);
  });

  it('treats a profile with no aliases as an empty list', () => {
    expect(profileFromRow({ bowler_name: 'X' }).aliases).toEqual([]);
  });
});
