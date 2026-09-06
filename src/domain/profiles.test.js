import { describe, it, expect } from 'vitest';
import {
  emptyProfile, normalizeProfile, resolveHandedness, addHomeCenter,
  removeHomeCenter, profileToRow, profileFromRow, membershipFor,
  resolveHomeCenters,
} from './profiles.js';

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
      bowlerName: 'Ryan', leftHanded: true, twoHanded: true, homeCenters: ['Bowlero'], notes: 'thumb tape',
      bookAverage: '213', bookGames: '90', bookSeason: '2025-26 Winter',
    };
    expect(profileFromRow(profileToRow(full, 'user-1'))).toEqual(full);
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
