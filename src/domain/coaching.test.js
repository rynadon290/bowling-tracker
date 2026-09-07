import { describe, it, expect } from 'vitest';
import {
  categorizeCoaching, normalizeTask, completeTask, recordAttempt, reopenTask,
  taskProgress, partitionTasks, taskToRow, taskFromRow, sortNotes, coachingToRow,
  bowlerSnapshot,
  shotBreakdown,
  respondedSince,
  latestResponseAt,
} from './coaching.js';
import { isSplit, isSinglePinLeave, isCornerPinLeave } from './splits.js';

const ME = 'u-me', COACH = 'u-coach', PUPIL = 'u-pupil', OTHER = 'u-other';
const names = { [COACH]: 'Coach Dave', [PUPIL]: 'Kim' };
const rows = [
  { id: 'r1', coach_id: ME, bowler_id: PUPIL, requested_by: ME, status: 'accepted' },
  { id: 'r2', coach_id: COACH, bowler_id: ME, requested_by: COACH, status: 'accepted' },
  { id: 'r3', coach_id: ME, bowler_id: OTHER, requested_by: OTHER, status: 'pending' },
  { id: 'r4', coach_id: COACH, bowler_id: ME, requested_by: ME, status: 'pending' },
  { id: 'r5', coach_id: OTHER, bowler_id: 'u-x', requested_by: OTHER, status: 'accepted' },
  { id: 'r6', coach_id: ME, bowler_id: OTHER, requested_by: ME, status: 'declined' },
];

describe('pairing', () => {
  it('separates people I coach from people who coach me', () => {
    const c = categorizeCoaching(rows, ME, names);
    expect(c.myBowlers.map(x => x.userId)).toEqual([PUPIL]);
    expect(c.myCoaches.map(x => x.userId)).toEqual([COACH]);
  });

  // Either side may initiate, so who asked says nothing about who coaches.
  it('routes requests by who has to answer, not by role', () => {
    const c = categorizeCoaching(rows, ME, names);
    expect(c.incoming.map(x => x.relationshipId)).toEqual(['r3']);
    expect(c.outgoing.map(x => x.relationshipId)).toEqual(['r4']);
  });

  it('reads the same row correctly from the other side', () => {
    expect(categorizeCoaching(rows, PUPIL, names).myCoaches[0].userId).toBe(ME);
  });

  it('ignores rows I am not part of, and hides declined ones', () => {
    const c = JSON.stringify(categorizeCoaching(rows, ME, names));
    expect(c).not.toContain('u-x');
    expect(c).not.toContain('r6');
  });

  it('never sends a status it does not recognise', () => {
    expect(coachingToRow({ coachId: ME, bowlerId: PUPIL, status: 'hacked' }, ME).status).toBe('pending');
  });
});

describe('tasks', () => {
  const task = normalizeTask({ title: 'Ten pins', metricId: 'tenPinSpareRate', target: '75' });

  it('refuses a task with no title', () => {
    expect(normalizeTask({ title: '   ' })).toBeNull();
  });

  it('drops an unrecognised metric and its target', () => {
    expect(normalizeTask({ title: 'X', metricId: 'bogus', target: '75' }).metricId).toBe('');
    expect(normalizeTask({ title: 'X', target: '75' }).target).toBe('');
  });

  // The point of the whole design: falling short is an outcome, not a
  // non-event. The number reached is what the coach needs.
  it('records an attempt that fell short with the number reached', () => {
    const att = recordAttempt(task, 68, 'worked all week');
    expect(att.status).toBe('attempted');
    const p = taskProgress(att);
    expect(p.reached).toBe(68);
    expect(p.met).toBe(false);
    expect(p.shortBy).toBe(7);
  });

  it('counts an attempt at or above target as met', () => {
    expect(taskProgress(recordAttempt(task, 80)).met).toBe(true);
    expect(taskProgress(recordAttempt(task, 80)).shortBy).toBeNull();
  });

  it('has no progress for a task with no measurable target', () => {
    expect(taskProgress(normalizeTask({ title: 'Just do it' }))).toBeNull();
  });

  it('labels the target for the bowler\'s hand', () => {
    expect(taskProgress(recordAttempt(task, 68), true).label).toBe('7 Pin Spare %');
    expect(taskProgress(recordAttempt(task, 68), false).label).toBe('10 Pin Spare %');
  });

  it('reopening clears the recorded result', () => {
    const re = reopenTask(recordAttempt(task, 68));
    expect(re.status).toBe('open');
    expect(re.result).toBe('');
  });

  it('splits tasks by state', () => {
    const p = partitionTasks([task, completeTask(task), recordAttempt(task, 68)]);
    expect(p.open).toHaveLength(1);
    expect(p.completed).toHaveLength(1);
    expect(p.attempted).toHaveLength(1);
  });

  it('round-trips through a row', () => {
    const row = taskToRow(recordAttempt(task, 68), 'r1', ME);
    expect(row.target).toBe(75);
    expect(taskFromRow({ ...row, id: 't1' }).result).toBe('68');
  });
});

describe('notes', () => {
  it('reads oldest first, like a conversation', () => {
    const n = sortNotes([
      { id: 'n2', body: 'second', createdAt: '2026-06-02', authorId: ME },
      { id: 'n1', body: 'first', createdAt: '2026-06-01', authorId: COACH },
    ]);
    expect(n.map(x => x.body)).toEqual(['first', 'second']);
  });

  it('drops an empty note', () => {
    expect(sortNotes([{ id: 'n', body: '   ', createdAt: '2026-06-01' }])).toHaveLength(0);
  });
});

describe('bowler snapshot for the coach', () => {
  const sess = [
    { bowler: 'Kim', league: 'Tue', date: '2026-06-02', scores: [170, 180, 175], total: 525 },
    { bowler: 'Kim', league: 'Tue', date: '2026-06-09', scores: [190, 195, 185], total: 570 },
    { bowler: 'Kim', league: 'Tue', date: '2026-06-16', scores: [200, 205, 195], total: 600 },
    { bowler: 'Kim', league: 'Tue', date: '2026-06-23', scores: [210, 215, 205], total: 630 },
    { bowler: 'Kim', league: 'Tue', date: '2026-06-30', scores: [220, 225, 215], total: 660 },
    { bowler: 'Kim', league: 'Tue', date: '2026-07-07', scores: [230, 235, 225], total: 690 },
  ];

  it('summarises average, high, and night count', () => {
    const snap = bowlerSnapshot(sess);
    expect(snap.high).toBe(235);
    expect(snap.nights).toBe(6);
  });

  it('lists at most 5 recent nights, most recent first', () => {
    const snap = bowlerSnapshot(sess);
    expect(snap.recent).toHaveLength(5);
    expect(snap.recent[0].date).toBe('2026-07-07');
  });

  it('does not claim a trend on too little history, but still reports the facts', () => {
    const thin = bowlerSnapshot([sess[0], sess[1]]);
    expect(thin).not.toBeNull();
    expect(thin.trendDirection).toBe('unknown');
  });

  it('returns null for no data', () => {
    expect(bowlerSnapshot(null)).toBeNull();
    expect(bowlerSnapshot([])).toBeNull();
  });

  // The bug this signature exists to prevent: a session's bowler_name is a
  // free-typed label and may not match the coached account's display
  // name. Pre-scoping by user_id at the query level, rather than
  // filtering by name a second time here, means that mismatch can no
  // longer silently erase a bowler's real history.
  it('does not lose data to a bowler-name mismatch', () => {
    const nickname = [{ bowler: 'K.', league: 'Tue', date: '2026-06-02', scores: [200, 210, 190] }];
    expect(bowlerSnapshot(nickname)?.average).toBe(200);
  });
});

// 11 of 14 coaches: scores tell them what, shots tell them why.
describe('shot breakdown for the coach', () => {
  const shots = Array.from({ length: 20 }, (_, i) => ({
    bowler: 'Dee', ballNum: null,
    result: i < 8 ? 'Strike' : 'Other Leave',
    otherLeave: i < 8 ? [] : ['7'],
    spareMade: i < 8 ? '' : (i % 2 ? 'Yes' : 'No'),
    miss: i % 3 === 0 ? ['Left'] : [],
  }));
  const preds = { isSplit, isSinglePinLeave, isCornerPinLeave };

  it('rates strikes over first balls, not every shot', () => {
    expect(shotBreakdown(shots, { ...preds, leftHanded: true }).strikeRate).toBe(40);
  });

  // The coach and the bowler can throw with different hands.
  it("uses the BOWLER's hand for the corner pin, not the coach's", () => {
    const asLefty = shotBreakdown(shots, { ...preds, leftHanded: true });
    expect(asLefty.cornerPinLabel).toBe('7 Pin');
    expect(asLefty.cornerPinSample).toBe(12);
    expect(shotBreakdown(shots, { ...preds, leftHanded: false }).cornerPinSample).toBe(0);
  });

  it('surfaces miss tendencies, most common first', () => {
    expect(shotBreakdown(shots, { ...preds, leftHanded: true }).misses[0]).toEqual({ miss: 'Left', count: 7 });
  });

  it('returns nothing rather than a zeroed card when there are no shots', () => {
    expect(shotBreakdown([], preds)).toBeNull();
    expect(shotBreakdown(null, preds)).toBeNull();
  });
});

// Push is blocked on packaging; knowing which bowler needs attention is
// the useful part and works today.
describe('unread task responses', () => {
  const tasks = {
    r1: [{ id: 't1', title: 'A', status: 'attempted', result: '68', completedAt: '2026-06-10T10:00:00Z' },
         { id: 't2', title: 'B', status: 'open' }],
    r2: [{ id: 't3', title: 'C', status: 'completed', completedAt: '2026-06-12T10:00:00Z' }],
  };

  it('finds responses since the coach last looked', () => {
    expect(Object.keys(respondedSince(tasks, '2026-06-05T00:00:00Z'))).toHaveLength(2);
  });

  it('does not treat an open task as a response', () => {
    expect(respondedSince(tasks, '2026-06-05T00:00:00Z').r1.map(t => t.title)).toEqual(['A']);
  });

  it('goes quiet once marked seen', () => {
    expect(Object.keys(respondedSince(tasks, latestResponseAt(tasks)))).toHaveLength(0);
  });
});
