import { describe, it, expect } from 'vitest';
import { addTeamMember, removeTeamMember, moveTeamMember, createTeamInvite, cancelTeamInvite, newTeamObject, resolvePlaceholder } from './TeamManagement.jsx';

function team(overrides) {
  return { id: 'team-1', name: 'Thursday Team', league: 'Thursday House Shot', members: [], pendingInvites: [], ...overrides };
}

describe('addTeamMember', () => {
  it('adds a new member with the correct next lineup position', () => {
    const teams = [team({ members: [{ userId: 'u1', displayName: 'Ryan', lineupPosition: 0 }] })];
    const result = addTeamMember(teams, 'team-1', { id: 'u2', display_name: 'Aaron' });
    expect(result[0].members).toHaveLength(2);
    expect(result[0].members[1]).toEqual({ userId: 'u2', displayName: 'Aaron', lineupPosition: 1 });
  });

  it('is a no-op if the person is already a member', () => {
    const teams = [team({ members: [{ userId: 'u1', displayName: 'Ryan', lineupPosition: 0 }] })];
    const result = addTeamMember(teams, 'team-1', { id: 'u1', display_name: 'Ryan' });
    expect(result[0].members).toHaveLength(1);
  });

  it('does not affect other teams', () => {
    const teams = [team({ id: 'team-1' }), team({ id: 'team-2' })];
    const result = addTeamMember(teams, 'team-1', { id: 'u1', display_name: 'Ryan' });
    expect(result.find(t => t.id === 'team-2').members).toHaveLength(0);
  });
});

describe('removeTeamMember', () => {
  it('removes exactly the specified member', () => {
    const teams = [team({ members: [
      { userId: 'u1', displayName: 'Ryan', lineupPosition: 0 },
      { userId: 'u2', displayName: 'Aaron', lineupPosition: 1 },
    ] })];
    const result = removeTeamMember(teams, 'team-1', 'u1');
    expect(result[0].members).toHaveLength(1);
    expect(result[0].members[0].userId).toBe('u2');
  });

  it('is a no-op if the person is not on the roster', () => {
    const teams = [team({ members: [{ userId: 'u1', displayName: 'Ryan', lineupPosition: 0 }] })];
    const result = removeTeamMember(teams, 'team-1', 'unknown-user');
    expect(result[0].members).toHaveLength(1);
  });
});

describe('moveTeamMember', () => {
  const teams = [team({ members: [
    { userId: 'u1', displayName: 'Ryan', lineupPosition: 0 },
    { userId: 'u2', displayName: 'Aaron', lineupPosition: 1 },
    { userId: 'u3', displayName: 'Rob', lineupPosition: 2 },
  ] })];

  it('swaps with the next member and renumbers lineup positions', () => {
    const result = moveTeamMember(teams, 'team-1', 0, 1);
    const members = result[0].members;
    expect(members.map(m => m.displayName)).toEqual(['Aaron', 'Ryan', 'Rob']);
    expect(members.map(m => m.lineupPosition)).toEqual([0, 1, 2]);
  });

  it('swaps with the previous member', () => {
    const result = moveTeamMember(teams, 'team-1', 2, -1);
    expect(result[0].members.map(m => m.displayName)).toEqual(['Ryan', 'Rob', 'Aaron']);
  });

  it('returns the exact same array reference when moving the first member up (out of bounds)', () => {
    const result = moveTeamMember(teams, 'team-1', 0, -1);
    expect(result).toBe(teams);
  });

  it('returns the exact same array reference when moving the last member down (out of bounds)', () => {
    const result = moveTeamMember(teams, 'team-1', 2, 1);
    expect(result).toBe(teams);
  });
});

describe('createTeamInvite', () => {
  it('creates an invite with the correct lineup position, after existing members and invites', () => {
    const teams = [team({
      members: [{ userId: 'u1', displayName: 'Ryan', lineupPosition: 0 }],
      pendingInvites: [{ id: 'inv-1', name: 'Rob', email: 'rob@example.com' }],
    })];
    const { teams: newTeams, invite, error } = createTeamInvite(teams, 'team-1', 'new-id', 'Aaron', 'AARON@Example.com');
    expect(error).toBeNull();
    expect(invite.lineupPosition).toBe(2); // 1 member + 1 existing invite
    expect(invite.email).toBe('aaron@example.com'); // normalized to lowercase
    expect(newTeams[0].pendingInvites).toHaveLength(2);
  });

  it('rejects a blank name', () => {
    const teams = [team()];
    expect(createTeamInvite(teams, 'team-1', 'id', '', 'a@example.com').error).toBe('invalid');
  });

  // These two tests used to assert the opposite -- that a name-only
  // placeholder was valid. That was the behaviour that made the
  // "Link Account" search necessary, and that search let a captain add
  // any account on the app to their roster without consent. Email is now
  // required, so a placeholder always has a way to resolve itself.
  it('rejects a name-only placeholder — there would be no way to link them', () => {
    const teams = [team()];
    const result = createTeamInvite(teams, 'team-1', 'id', 'Aaron', '');
    expect(result.error).toBe('no-email');
    expect(result.invite).toBeNull();
  });

  it('does not add an email-less placeholder to the roster', () => {
    const teams = [team()];
    const result = createTeamInvite(teams, 'team-1', 'id', 'Aaron', '');
    expect(result.teams[0].pendingInvites).toHaveLength(0);
  });

  it('rejects a duplicate email, case-insensitively', () => {
    const teams = [team({ pendingInvites: [{ id: 'inv-1', name: 'Aaron', email: 'aaron@example.com' }] })];
    const result = createTeamInvite(teams, 'team-1', 'new-id', 'Aaron Again', 'Aaron@Example.com');
    expect(result.error).toBe('duplicate');
    expect(result.teams[0].pendingInvites).toHaveLength(1);
  });

  it('returns a no-team error for an unknown team id', () => {
    const teams = [team()];
    expect(createTeamInvite(teams, 'nonexistent', 'id', 'Aaron', 'a@example.com').error).toBe('no-team');
  });
});

describe('cancelTeamInvite', () => {
  it('removes exactly the specified pending invite', () => {
    const teams = [team({ pendingInvites: [
      { id: 'inv-1', name: 'Aaron', email: 'aaron@example.com' },
      { id: 'inv-2', name: 'Rob', email: 'rob@example.com' },
    ] })];
    const result = cancelTeamInvite(teams, 'team-1', 'inv-1');
    expect(result[0].pendingInvites).toHaveLength(1);
    expect(result[0].pendingInvites[0].id).toBe('inv-2');
  });
});

describe('newTeamObject', () => {
  // REGRESSION: a real production bug — createTeam() originally built the
  // new team object inline as { id, name, league, members: [] }, omitting
  // pendingInvites entirely. The render code calls team.pendingInvites.map()
  // and .length unconditionally, so creating any team crashed the app the
  // instant it tried to render (black screen, no error boundary). This test
  // pins down every field the render code actually depends on.
  it('includes pendingInvites as an empty array, not undefined', () => {
    const team = newTeamObject('team-1', 'Thursday Team', 'Thursday House Shot');
    expect(Array.isArray(team.pendingInvites)).toBe(true);
    expect(team.pendingInvites).toEqual([]);
  });

  it('includes members as an empty array', () => {
    const team = newTeamObject('team-1', 'Thursday Team', 'Thursday House Shot');
    expect(Array.isArray(team.members)).toBe(true);
    expect(team.members).toEqual([]);
  });

  it('sets id, name, and league exactly as given', () => {
    const team = newTeamObject('team-1', 'Thursday Team', 'Thursday House Shot');
    expect(team.id).toBe('team-1');
    expect(team.name).toBe('Thursday Team');
    expect(team.league).toBe('Thursday House Shot');
  });

  it('a freshly-created team survives the exact render-path operations that crashed before', () => {
    // Simulates what the render code actually does: .length and .map() on
    // pendingInvites, and the empty-roster check that reads both arrays.
    const team = newTeamObject('team-1', 'Thursday Team', 'Thursday House Shot');
    expect(() => {
      const isEmpty = team.members.length === 0 && team.pendingInvites.length === 0;
      const rendered = team.pendingInvites.map(inv => inv.name);
      return { isEmpty, rendered };
    }).not.toThrow();
  });
});

describe('resolvePlaceholder', () => {
  function team(overrides) {
    return { id: 'team-1', name: 'Thursday Team', league: 'Thursday House Shot', members: [], pendingInvites: [], ...overrides };
  }

  it('converts a placeholder into a real member, preserving its lineup position', () => {
    const teams = [team({
      members: [{ userId: 'u1', displayName: 'Ryan', lineupPosition: 0 }],
      pendingInvites: [{ id: 'inv-1', name: 'Aaron', email: null, lineupPosition: 1 }],
    })];
    const result = resolvePlaceholder(teams, 'team-1', 'inv-1', { id: 'u2', display_name: 'Aaron' });
    expect(result[0].pendingInvites).toHaveLength(0);
    expect(result[0].members[1]).toEqual({ userId: 'u2', displayName: 'Aaron', lineupPosition: 1 });
  });

  it('does not mutate the original teams array', () => {
    const teams = [team({ pendingInvites: [{ id: 'inv-1', name: 'Aaron', email: null, lineupPosition: 0 }] })];
    resolvePlaceholder(teams, 'team-1', 'inv-1', { id: 'u2', display_name: 'Aaron' });
    expect(teams[0].pendingInvites).toHaveLength(1);
  });

  it('returns the same array reference for an unknown team', () => {
    const teams = [team()];
    expect(resolvePlaceholder(teams, 'nonexistent', 'inv-1', { id: 'u2', display_name: 'Aaron' })).toBe(teams);
  });

  it('returns the same array reference for an unknown invite', () => {
    const teams = [team({ pendingInvites: [{ id: 'inv-1', name: 'Aaron', email: null, lineupPosition: 0 }] })];
    expect(resolvePlaceholder(teams, 'team-1', 'nonexistent-invite', { id: 'u2', display_name: 'Aaron' })).toBe(teams);
  });

  it('drops the placeholder without duplicating if the account is already a member somehow', () => {
    const teams = [team({
      members: [{ userId: 'u2', displayName: 'Aaron', lineupPosition: 0 }],
      pendingInvites: [{ id: 'inv-1', name: 'Aaron', email: null, lineupPosition: 1 }],
    })];
    const result = resolvePlaceholder(teams, 'team-1', 'inv-1', { id: 'u2', display_name: 'Aaron' });
    expect(result[0].members).toHaveLength(1);
    expect(result[0].pendingInvites).toHaveLength(0);
  });

  it('falls back to the end of the roster if the invite has no lineup position at all', () => {
    const teams = [team({
      members: [{ userId: 'u1', displayName: 'Ryan', lineupPosition: 0 }],
      pendingInvites: [{ id: 'inv-1', name: 'Aaron', email: null }],
    })];
    const result = resolvePlaceholder(teams, 'team-1', 'inv-1', { id: 'u2', display_name: 'Aaron' });
    expect(result[0].members[1].lineupPosition).toBe(1);
  });
});

// Email is required on a placeholder.
//
// It's the only link between the placeholder and the account the person
// eventually creates. Without one, the only way to connect them was a
// captain searching every profile on the app and pressing Link -- which
// let a captain add ANY user to their roster without that person
// knowing, and team membership grants read access to their sessions and
// shots.
describe('createTeamInvite requires an email', () => {
  const teams = [{ id: 't1', name: 'Split Happens', league: 'Tuesday', members: [], pendingInvites: [] }];

  it('rejects a placeholder with no email', () => {
    const r = createTeamInvite(teams, 't1', 'i1', 'Dave', '');
    expect(r.error).toBe('no-email');
    expect(r.invite).toBeNull();
  });

  it('rejects whitespace as an email', () => {
    expect(createTeamInvite(teams, 't1', 'i1', 'Dave', '   ').error).toBe('no-email');
  });

  it('rejects something that is not an email', () => {
    expect(createTeamInvite(teams, 't1', 'i1', 'Dave', 'dave').error).toBe('bad-email');
    expect(createTeamInvite(teams, 't1', 'i1', 'Dave', 'dave@').error).toBe('bad-email');
    expect(createTeamInvite(teams, 't1', 'i1', 'Dave', 'dave@nowhere').error).toBe('bad-email');
  });

  it('accepts a real email and stores it lowercased', () => {
    const r = createTeamInvite(teams, 't1', 'i1', 'Dave', '  Dave@Example.COM ');
    expect(r.error).toBeNull();
    expect(r.invite.email).toBe('dave@example.com');
  });

  // The email is what matches a signup, so two placeholders sharing one
  // would both claim the same person.
  it('still rejects a duplicate email on the same team', () => {
    const first = createTeamInvite(teams, 't1', 'i1', 'Dave', 'dave@example.com');
    const second = createTeamInvite(first.teams, 't1', 'i2', 'Dave again', 'dave@example.com');
    expect(second.error).toBe('duplicate');
  });

  it('still requires a name', () => {
    expect(createTeamInvite(teams, 't1', 'i1', '', 'dave@example.com').error).toBe('invalid');
  });
});
