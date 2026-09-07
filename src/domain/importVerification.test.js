import { describe, it, expect } from 'vitest';
import {
  emptyImportRecord, normalizeImportRecord, effectiveScores, isConfirmed,
  approve, reject, canCorrect, correctAsTeammate, laterSessionEnded,
  describeStatus, pendingFor, needingReentry,
} from './importVerification.js';

const base = { ...emptyImportRecord('Kim', 'Ryan'), id: 'i1', league: 'Tue', date: '2026-06-02', importedScores: [180, 190, 175] };
const sessions = [{ league: 'Tue', date: '2026-06-02' }, { league: 'Tue', date: '2026-06-09' }];
const later = new Date('2026-06-10');

describe('pending scores', () => {
  // A team average cannot sit unresolved waiting on the one member who
  // bowls and goes home, so silence is acceptance -- which means pending
  // already counts and nothing has to flip on a timer.
  it('count immediately', () => {
    expect(effectiveScores(base)).toEqual([180, 190, 175]);
  });

  it('are labelled as unconfirmed rather than shown as settled', () => {
    expect(isConfirmed(base)).toBe(false);
    expect(describeStatus(base)).toContain('not yet confirmed');
  });
});

describe('the bowler responds', () => {
  it('approving confirms the imported numbers', () => {
    const a = approve(base);
    expect(isConfirmed(a)).toBe(true);
    expect(effectiveScores(a)).toEqual([180, 190, 175]);
  });

  it('rejecting with corrections replaces them', () => {
    expect(effectiveScores(reject(base, [200, 195, 205]))).toEqual([200, 195, 205]);
  });

  // The important one: a disputed number is not data. It must not keep
  // counting just because nothing replaced it yet.
  it('rejecting without corrections stops the scores counting', () => {
    const r = reject(base, null);
    expect(effectiveScores(r)).toBeNull();
    expect(needingReentry([r])).toHaveLength(1);
  });
});

describe('a teammate correcting after silence', () => {
  it('lets the bowler fix their own at any time', () => {
    expect(canCorrect(base, 'Kim').allowed).toBe(true);
  });

  it('requires the correcting teammate to have verified scores of their own', () => {
    expect(canCorrect(base, 'Dave', { sessions, verifiedTeammates: [], today: later }).allowed).toBe(false);
    expect(canCorrect(base, 'Dave', { sessions, verifiedTeammates: ['Dave'], today: later }).allowed).toBe(true);
  });

  it('makes them wait until the next session has finished', () => {
    const early = { sessions: [{ league: 'Tue', date: '2026-06-02' }], verifiedTeammates: ['Dave'], today: new Date('2026-06-03') };
    expect(canCorrect(base, 'Dave', early).allowed).toBe(false);
    expect(canCorrect(base, 'Dave', early).reason).toContain('next session');
  });

  // A teammate does not get to overrule the person the scores belong to.
  it('will not overrule a bowler who already responded', () => {
    const opts = { sessions, verifiedTeammates: ['Dave'], today: later };
    expect(canCorrect(approve(base), 'Dave', opts).allowed).toBe(false);
    expect(canCorrect(reject(base, [1, 2, 3]), 'Dave', opts).allowed).toBe(false);
  });

  it('records who made the correction', () => {
    const { record } = correctAsTeammate(base, [201, 202, 203], 'Dave', { sessions, verifiedTeammates: ['Dave'], today: later });
    expect(record.correctedBy).toBe('Dave');
    expect(describeStatus(record)).toContain('Dave');
  });

  it('returns an error rather than silently doing nothing', () => {
    expect(correctAsTeammate(base, [1, 2, 3], 'Dave', { sessions, verifiedTeammates: [], today: later }).error).toBeTruthy();
  });
});

describe('the session window', () => {
  // Nights, not a wall clock -- a timer would expire over a holiday break
  // when nobody was bowling at all.
  it('only counts a later session in the same league that has happened', () => {
    expect(laterSessionEnded(base, sessions, later)).toBe(true);
    expect(laterSessionEnded(base, [{ league: 'Thu', date: '2026-06-09' }], later)).toBe(false);
    expect(laterSessionEnded(base, [{ league: 'Tue', date: '2026-07-01' }], new Date('2026-06-10'))).toBe(false);
  });
});

describe('validation', () => {
  it('drops impossible scores and refuses a nameless record', () => {
    expect(normalizeImportRecord({ bowler: 'K', importedScores: [301, 180] }).importedScores[0]).toBeNull();
    expect(normalizeImportRecord({ bowler: '  ' })).toBeNull();
  });

  it('coerces an unknown status to pending', () => {
    expect(normalizeImportRecord({ bowler: 'K', status: 'hacked' }).status).toBe('pending');
  });

  it('lists only that bowler\'s pending records', () => {
    expect(pendingFor([base, approve(base)], 'Kim')).toHaveLength(1);
    expect(pendingFor([base], 'Dave')).toHaveLength(0);
  });
});
