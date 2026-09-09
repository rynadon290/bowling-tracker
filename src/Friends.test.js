import { describe, it, expect } from 'vitest';
import { categorizeFriendships } from './Friends.jsx';

// computeLeaderboard's tests moved to domain/stats.test.js as a check on
// cAvg's game-weighting -- the leaderboard feature they were written
// for was removed when Compare To took over as the way to see how you
// stack up against a friend or a team, but the underlying correctness
// property (average must be weighted by games, not nights) is still
// real and still worth pinning down.

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

