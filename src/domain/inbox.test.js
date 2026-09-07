import { describe, it, expect } from 'vitest';
import { buildInbox, inboxCount } from './inbox.js';
import { emptyImportRecord, normalizeImportRecord, approve, reject } from './importVerification.js';

const rec = (bowler, over) => normalizeImportRecord({
  ...emptyImportRecord(bowler, 'Ryan'), id: 'i-' + bowler + (over?.id || ''),
  league: 'Tue', date: '2026-06-02', importedScores: [180, 190, 175], ...over,
});

describe('what lands in the inbox', () => {
  it('is empty when nothing is outstanding', () => {
    expect(buildInbox({ bowler: 'Ryan', userId: 'u1' })).toEqual([]);
  });

  it('collects every source', () => {
    const items = buildInbox({
      bowler: 'Kim', userId: 'u2',
      importedScores: [rec('Kim')],
      coachingRelationships: [{ id: 'r1', coach_id: 'd', bowler_id: 'u2', requested_by: 'd', status: 'pending' }],
      coachingProfilesById: { d: 'Dave' },
      friendRequests: [{ friendshipId: 'f1', displayName: 'Sam' }],
      teamInvites: [{ id: 't1', teamName: 'Tuesday' }],
      bookAverageDue: { needed: true, league: 'Tue' },
      catalogRejections: ['Bionic'],
    });
    expect(items.map(i => i.type).sort()).toEqual(
      ['bookAverage', 'catalogRejection', 'coachingRequest', 'friendRequest', 'importedScores', 'teamInvite'].sort());
  });

  // Somebody waiting on an answer beats housekeeping the app noticed.
  it('puts people waiting on you first', () => {
    const items = buildInbox({
      bowler: 'Kim', userId: 'u2',
      bookAverageDue: { needed: true },
      coachingRelationships: [{ id: 'r1', coach_id: 'd', bowler_id: 'u2', requested_by: 'd', status: 'pending' }],
      coachingProfilesById: { d: 'Dave' },
    });
    expect(items[0].type).toBe('coachingRequest');
    expect(items[items.length - 1].type).toBe('bookAverage');
  });

  it('drops things once they are resolved', () => {
    expect(buildInbox({ bowler: 'Kim', userId: 'u2', importedScores: [approve(rec('Kim'))] })).toEqual([]);
    expect(buildInbox({ bowler: 'Kim', userId: 'u2', bookAverageDue: { needed: false } })).toEqual([]);
  });

  it('turns a rejection into something to re-enter', () => {
    expect(buildInbox({ bowler: 'Kim', userId: 'u2', importedScores: [reject(rec('Kim'), null)] })
      .some(i => i.type === 'importReentry')).toBe(true);
  });
});

describe('the coach and bowler sides differ', () => {
  const rels = [{ id: 'r1', coach_id: 'dave', bowler_id: 'u2', requested_by: 'dave', status: 'accepted' }];

  it('shows a bowler the work their coach set', () => {
    const items = buildInbox({
      bowler: 'Kim', userId: 'u2', coachingRelationships: rels, coachingProfilesById: { dave: 'Dave' },
      tasksByRelationship: { r1: [{ id: 't1', title: 'Ten pins', status: 'open' }, { id: 't2', title: 'x', status: 'completed' }] },
    });
    const task = items.find(i => i.type === 'coachTask');
    expect(task.count).toBe(1);
  });

  // A coach's own assigned tasks are not homework for the coach.
  it('does not show a coach their own set tasks as work to do', () => {
    const items = buildInbox({
      bowler: 'Dave', userId: 'dave', coachViewOn: true, coachingRelationships: rels,
      tasksByRelationship: { r1: [{ id: 't1', title: 'x', status: 'open' }] },
      unreadResponses: { r1: [{ id: 't1' }] },
    });
    expect(items.some(i => i.type === 'coachTask')).toBe(false);
    expect(items.some(i => i.type === 'teammateResponse')).toBe(true);
  });
});

describe('the badge count', () => {
  // A badge reading 14 makes an app feel like a chore. Five tasks from
  // one coach is one thing to go and deal with.
  it('counts items, not underlying records', () => {
    const items = buildInbox({
      bowler: 'Kim', userId: 'u2',
      coachingRelationships: [{ id: 'r1', coach_id: 'd', bowler_id: 'u2', requested_by: 'd', status: 'accepted' }],
      coachingProfilesById: { d: 'Dave' },
      tasksByRelationship: { r1: [1, 2, 3, 4, 5].map(n => ({ id: 't' + n, title: 't', status: 'open' })) },
    });
    expect(inboxCount(items)).toBe(1);
    expect(items[0].count).toBe(5);
  });
});
