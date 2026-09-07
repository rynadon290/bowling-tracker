import { describe, it, expect } from 'vitest';
import {
  categorizeCoaching, normalizeTask, completeTask, recordAttempt, reopenTask,
  taskProgress, partitionTasks, taskToRow, taskFromRow, sortNotes, coachingToRow,
} from './coaching.js';

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
