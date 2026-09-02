import { describe, it, expect } from 'vitest';
import { categorizeFriendships, computeLeaderboard } from './Friends.jsx';

describe('categorizeFriendships', () => {
  const myId = 'me';
  const friendships = [
    { id: 'f1', requester_id: 'me', addressee_id: 'aaron', status: 'accepted' },
    { id: 'f2', requester_id: 'rob', addressee_id: 'me', status: 'pending' },
    { id: 'f3', requester_id: 'me', addressee_id: 'zack', status: 'pending' },
    { id: 'f4', requester_id: 'lee', addressee_id: 'tommy', status: 'accepted' }, // doesn't involve me
  ];
  const profilesById = { aaron: 'Aaron', rob: 'Rob', zack: 'Zack' };
  const result = categorizeFriendships(friendships, myId, profilesById);

  it('sorts an accepted friendship into accepted', () => {
    expect(result.accepted).toEqual([{ friendshipId: 'f1', userId: 'aaron', displayName: 'Aaron' }]);
  });

  it('sorts a pending request where I am the addressee into incoming', () => {
    expect(result.incoming).toEqual([{ friendshipId: 'f2', userId: 'rob', displayName: 'Rob' }]);
  });

  it('sorts a pending request where I am the requester into outgoing', () => {
    expect(result.outgoing).toEqual([{ friendshipId: 'f3', userId: 'zack', displayName: 'Zack' }]);
  });

  it('excludes friendships that do not involve me at all', () => {
    const total = result.accepted.length + result.incoming.length + result.outgoing.length;
    expect(total).toBe(3); // not 4 -- f4 correctly excluded
  });

  it('falls back to "Unknown" if a profile lookup is missing', () => {
    const withMissing = categorizeFriendships(
      [{ id: 'f5', requester_id: 'me', addressee_id: 'ghost', status: 'accepted' }],
      'me', {}
    );
    expect(withMissing.accepted[0].displayName).toBe('Unknown');
  });
});

describe('computeLeaderboard', () => {
  const sessions = [
    { user_id: 'me', average: 200 },
    { user_id: 'me', average: 210 },
    { user_id: 'aaron', average: 180 },
    { user_id: 'aaron', average: 190 },
    { user_id: 'aaron', average: 200 },
    { user_id: 'unrelated-person', average: 300 },
    { user_id: 'rob', average: null },
  ];
  const nameById = { me: 'You', aaron: 'Aaron' };
  const board = computeLeaderboard(sessions, nameById);

  it('excludes anyone not in nameById, even with a great average', () => {
    expect(board).toHaveLength(2);
    expect(board.some(r => r.userId === 'unrelated-person')).toBe(false);
  });

  it('excludes sessions with a null average', () => {
    expect(board.some(r => r.userId === 'rob')).toBe(false);
  });

  it('ranks by overall average, highest first', () => {
    expect(board[0].userId).toBe('me');
    expect(board[1].userId).toBe('aaron');
  });

  it('computes the correct average per person', () => {
    expect(board[0].overallAverage).toBe(205); // (200+210)/2
    expect(board[1].overallAverage).toBe(190); // (180+190+200)/3
  });

  it('tracks the correct session count per person', () => {
    expect(board[0].sessionCount).toBe(2);
    expect(board[1].sessionCount).toBe(3);
  });

  it('returns an empty leaderboard for no sessions', () => {
    expect(computeLeaderboard([], nameById)).toEqual([]);
  });
});
