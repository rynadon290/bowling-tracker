import { describe, it, expect } from 'vitest';
import { addTeamMember, removeTeamMember, moveTeamMember, createTeamInvite, cancelTeamInvite } from './TeamManagement.jsx';

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

  it('rejects a blank name or email', () => {
    const teams = [team()];
    expect(createTeamInvite(teams, 'team-1', 'id', '', 'a@example.com').error).toBe('invalid');
    expect(createTeamInvite(teams, 'team-1', 'id', 'Aaron', '').error).toBe('invalid');
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
