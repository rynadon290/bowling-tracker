import { describe, it, expect } from 'vitest';
import {
  emptyImportRecord, normalizeImportRecord, effectiveScores, isConfirmed,
  approve, reject, canCorrect, correctAsTeammate, laterSessionEnded,
  describeStatus, pendingFor, needingReentry,
  isValidGameScore,
  invalidScoreIndexes,
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

// Frame data travels with an import as a PROPOSAL. The photo always
// contained every bowler's frames; they used to be discarded, so a
// teammate could never get shot-level stats from an import even though
// the data existed when it was scanned.
describe('imported frame data', () => {
  const withFrames = {
    bowler: 'Sam', league: 'Tuesday House Shot', date: '2026-09-03',
    importedScores: [200, 180, 210],
    importedShots: [{ gameNumber: 1, ballUsed: 'Ion Max', shots: [{ frame: '1', result: 'Strike' }] }],
  };

  it('carries frames through normalization', () => {
    expect(normalizeImportRecord(withFrames).importedShots).toHaveLength(1);
  });

  // A card showing only totals is a normal case, not a failure.
  it('defaults to no frames when the card had none', () => {
    const r = normalizeImportRecord({ bowler: 'Sam', importedScores: [200] });
    expect(r.importedShots).toEqual([]);
    expect(r.correctedShots).toBeNull();
  });

  it('survives approval rather than being dropped with correctedScores', () => {
    const approved = approve(normalizeImportRecord(withFrames));
    expect(approved.status).toBe('verified');
    expect(approved.importedShots).toHaveLength(1);
  });

  it('ignores a non-array, so bad cloud data cannot crash the inbox', () => {
    const r = normalizeImportRecord({ ...withFrames, importedShots: 'nope' });
    expect(r.importedShots).toEqual([]);
  });
});

// A garbled OCR read -- 1.95e+127 was a real one off a real card --
// displayed as a valid series, passed review, and was then silently
// nulled by cleanScores on arrival. The teammate got a blank score and
// nobody knew why.
describe('isValidGameScore', () => {
  it('rejects a value no game of bowling can produce', () => {
    expect(isValidGameScore('1.95e+127')).toBe(false);
    expect(isValidGameScore(301)).toBe(false);
    expect(isValidGameScore(-5)).toBe(false);
  });

  it('rejects a non-integer, since games are scored in whole pins', () => {
    expect(isValidGameScore(12.5)).toBe(false);
  });

  it('accepts every real score including the extremes', () => {
    expect(isValidGameScore(0)).toBe(true);
    expect(isValidGameScore(300)).toBe(true);
    expect(isValidGameScore('200')).toBe(true);
  });

  // "They didn't bowl game 3" is a real answer, distinct from a misread.
  it('accepts empty', () => {
    expect(isValidGameScore("")).toBe(true);
    expect(isValidGameScore(null)).toBe(true);
    expect(isValidGameScore(undefined)).toBe(true);
  });
});

describe('invalidScoreIndexes', () => {
  it('points at exactly the boxes that need fixing', () => {
    expect(invalidScoreIndexes([200, '1.95e+127', 180])).toEqual([1]);
    expect(invalidScoreIndexes([200, 180, 210])).toEqual([]);
    expect(invalidScoreIndexes([999, 180, 400])).toEqual([0, 2]);
  });

  it('treats a blank game as fine, not as an error to fix', () => {
    expect(invalidScoreIndexes([200, '', 180])).toEqual([]);
  });
});
