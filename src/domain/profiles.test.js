import { describe, it, expect } from 'vitest';
import {
  emptyProfile, normalizeProfile, resolveHandedness, addHomeCenter,
  removeHomeCenter, profileToRow, profileFromRow, membershipFor,
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
  it('adds a center', () => {
    expect(addHomeCenter(emptyProfile('Ryan'), 'Bowlero').homeCenters).toEqual(['Bowlero']);
  });

  it('dedupes case-insensitively so one house does not split into two', () => {
    let p = addHomeCenter(emptyProfile('Ryan'), 'Bowlero Pittsburgh');
    p = addHomeCenter(p, 'bowlero pittsburgh');
    expect(p.homeCenters).toEqual(['Bowlero Pittsburgh']);
  });

  it('ignores blank input', () => {
    expect(addHomeCenter(emptyProfile('Ryan'), '   ').homeCenters).toEqual([]);
  });

  it('removes a center', () => {
    let p = addHomeCenter(emptyProfile('Ryan'), 'Bowlero');
    expect(removeHomeCenter(p, 'Bowlero').homeCenters).toEqual([]);
  });
});

describe('supabase round trip', () => {
  it('preserves every field in both directions', () => {
    const full = { bowlerName: 'Ryan', leftHanded: true, twoHanded: true, homeCenters: ['Bowlero'], notes: 'thumb tape' };
    expect(profileFromRow(profileToRow(full, 'user-1'))).toEqual(full);
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
