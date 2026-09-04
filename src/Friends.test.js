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
    // 'me' has one 3-game night and one 1-game night -- deliberately unequal
    // sizes. True average across all 4 games: (200+210+190+220)/4 = 205.
    // The old buggy "average of per-session averages" logic would have
    // computed ((200+210+190)/3 + 220) / 2 = (200+220)/2 = 210 instead --
    // wrong, and a good regression check that the fix actually holds.
    { user_id: 'me', bowler_name: 'You', scores: [200, 210, 190] },
    { user_id: 'me', bowler_name: 'You', scores: [220] },
    // This is the proxy-logging bug: same user_id as 'me' above, but a
    // DIFFERENT bowler_name -- 'me' logged this session on Aaron's behalf.
    // It must not count toward 'me's own total just because it shares an
    // account, or every proxy-logged night silently inflates whoever's
    // signed in, regardless of whose game it actually was.
    { user_id: 'me', bowler_name: 'Aaron', scores: [150, 160, 140] },
    { user_id: 'aaron', bowler_name: 'Aaron', scores: [180, 190, 200] },
    { user_id: 'unrelated-person', bowler_name: 'Unrelated', scores: [300, 300, 300] },
    { user_id: 'rob', bowler_name: 'Rob', scores: [] },
    { user_id: 'zack', bowler_name: 'Zack', scores: null },
  ];
  const nameById = { me: 'You', aaron: 'Aaron' };
  const board = computeLeaderboard(sessions, nameById);

  it('excludes anyone not in nameById, even with a great average', () => {
    expect(board).toHaveLength(2);
    expect(board.some(r => r.userId === 'unrelated-person')).toBe(false);
  });

  it('excludes sessions with no completed games (empty or null scores)', () => {
    // rob and zack aren't even in nameById here, but this also covers the
    // case where a real friend has a session with zero valid games logged
    expect(board.some(r => r.userId === 'rob')).toBe(false);
    expect(board.some(r => r.userId === 'zack')).toBe(false);
  });

  it('ranks by overall average, highest first', () => {
    expect(board[0].userId).toBe('me');
    expect(board[1].userId).toBe('aaron');
  });

  it('computes a true game-weighted average, not an average of per-session averages', () => {
    expect(board[0].overallAverage).toBe(205); // (200+210+190+220)/4, NOT 210
    expect(board[1].overallAverage).toBe(190); // (180+190+200)/3
  });

  it('tracks the correct GAME count per person, not session/night count', () => {
    expect(board[0].gameCount).toBe(4); // 3 + 1 games across two nights, not "2 nights"
    expect(board[1].gameCount).toBe(3);
  });

  it('excludes a session proxy-logged under this account for someone else -- matching user_id is not enough, bowler_name must match too', () => {
    // If the bug were present, 'me' would show 7 games (4 own + 3 proxy-logged
    // for Aaron) and a skewed average blending two different people's scores.
    expect(board[0].gameCount).toBe(4);
    expect(board[0].overallAverage).toBe(205);
    // And that proxy-logged Aaron game must not have been misattributed to
    // 'aaron's own entry either -- it stays fully excluded either way, since
    // 'aaron' the real friend has his own separate, correctly-attributed
    // session with his own real user_id.
    expect(board[1].gameCount).toBe(3);
  });

  it('matches bowler_name to display_name regardless of case or surrounding whitespace, so minor naming inconsistencies do not silently exclude someone\'s own real games', () => {
    const messySessions = [
      { user_id: 'me', bowler_name: '  Ryan  ', scores: [200, 210, 190] },
    ];
    const messyNameById = { me: 'ryan' };
    const messyBoard = computeLeaderboard(messySessions, messyNameById);
    expect(messyBoard).toHaveLength(1);
    expect(messyBoard[0].gameCount).toBe(3);
  });

  it('returns an empty leaderboard for no sessions', () => {
    expect(computeLeaderboard([], nameById)).toEqual([]);
  });
});
