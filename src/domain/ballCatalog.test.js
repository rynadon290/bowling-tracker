import { describe, it, expect } from 'vitest';
import {
  catalogState, isLocked, canEdit, canVote, approvalsUntilNext,
  stateDescription, clearedSpecsAfterRejection, ballKey, bestEntry,
  APPROVAL_THRESHOLD, VERIFICATION_THRESHOLD, REJECTION_THRESHOLD,
  rejectedBallsFor,
} from './ballCatalog.js';

const entry = o => ({ submittedBy: 'u1', approvals: 0, rejections: 0, createdAt: '2026-01-01', ...o });

describe('state transitions', () => {
  it('moves new -> approved -> verified as approvals accumulate', () => {
    expect(catalogState(entry({ approvals: 0 }))).toBe('new');
    expect(catalogState(entry({ approvals: APPROVAL_THRESHOLD }))).toBe('approved');
    expect(catalogState(entry({ approvals: VERIFICATION_THRESHOLD }))).toBe('verified');
  });

  it('rejects once enough people flag it', () => {
    expect(catalogState(entry({ rejections: REJECTION_THRESHOLD - 1 }))).toBe('new');
    expect(catalogState(entry({ rejections: REJECTION_THRESHOLD }))).toBe('rejected');
  });

  it('treats the two outcomes as a race -- whichever threshold lands first', () => {
    // Rejection wins only if it got there BEFORE verification. An entry
    // that reached the verification threshold is already locked and voting
    // has stopped, so it cannot subsequently accumulate rejections.
    expect(catalogState(entry({ approvals: 4, rejections: REJECTION_THRESHOLD }))).toBe('rejected');
    expect(catalogState(entry({ approvals: VERIFICATION_THRESHOLD, rejections: REJECTION_THRESHOLD }))).toBe('verified');
  });

  it('resolves an even split toward rejection', () => {
    // Approval and rejection need the same number of people, so a tie is
    // possible. Wrong specs cost more than missing ones: a bowler can
    // re-enter specs, but can't easily tell that numbers they trusted
    // are bad.
    expect(APPROVAL_THRESHOLD).toBe(REJECTION_THRESHOLD);
    expect(catalogState(entry({ approvals: 2, rejections: 2 }))).toBe('rejected');
  });

  it('makes verification terminal', () => {
    expect(catalogState(entry({ approvals: 20, rejections: 10 }))).toBe('verified');
  });
});

describe('editing rules', () => {
  it('locks a verified entry against everyone, including its author', () => {
    // This is the whole point: one person must not be able to change a
    // value a hundred others already agreed on.
    const verified = entry({ approvals: VERIFICATION_THRESHOLD });
    expect(isLocked(verified)).toBe(true);
    expect(canEdit(verified, 'u1')).toBe(false);
  });

  it('lets the author edit while the entry is still unlocked', () => {
    expect(canEdit(entry({ approvals: 1 }), 'u1')).toBe(true);
  });

  it("never lets one user edit another user's submission", () => {
    expect(canEdit(entry({ approvals: 0 }), 'someone-else')).toBe(false);
  });
});

describe('voting rules', () => {
  it('prevents voting on your own submission', () => {
    // Otherwise one person could walk their own entry to verified.
    expect(canVote(entry({}), 'u1')).toBe(false);
    expect(canVote(entry({}), 'u2')).toBe(true);
  });

  it('stops voting once an entry is settled either way', () => {
    // Closing voting on verified entries is what actually makes
    // verification terminal, rather than just a label.
    expect(canVote(entry({ rejections: REJECTION_THRESHOLD }), 'u2')).toBe(false);
    expect(canVote(entry({ approvals: VERIFICATION_THRESHOLD }), 'u2')).toBe(false);
  });
});

describe('provenance disclaimers', () => {
  it('says unconfirmed entries came from another bowler and are unverified', () => {
    expect(stateDescription(entry({}))).toContain('not yet confirmed');
  });

  it('makes clear approved specs are not manufacturer data', () => {
    const d = stateDescription(entry({ approvals: APPROVAL_THRESHOLD }));
    expect(d).toContain('another bowler');
    expect(d).toContain('Not manufacturer data');
  });
});

describe('rejection keeps the ball', () => {
  it('clears the specs but preserves the ball name', () => {
    // The bowler knows they own a Phaze II. Only the numbers were disputed,
    // so removing the equipment from their arsenal would be worse than
    // leaving it spec-less.
    const cleared = clearedSpecsAfterRejection('Phaze II');
    expect(cleared.ballName).toBe('Phaze II');
    expect(cleared.rg).toBe('');
    expect(cleared.coverstock).toBe('');
  });
});

describe('ballKey', () => {
  it('matches the same ball across casing and spacing', () => {
    expect(ballKey('Phaze II')).toBe(ballKey('  phaze   ii '));
  });
});

describe('bestEntry', () => {
  it('prefers a verified entry over a more recent unverified one', () => {
    const entries = [
      entry({ submittedBy: 'a', approvals: 1, createdAt: '2026-06-01' }),
      entry({ submittedBy: 'b', approvals: VERIFICATION_THRESHOLD, createdAt: '2026-01-01' }),
    ];
    expect(bestEntry(entries).submittedBy).toBe('b');
  });

  it('excludes rejected entries entirely', () => {
    expect(bestEntry([entry({ rejections: REJECTION_THRESHOLD })])).toBeNull();
  });

  it('breaks ties toward the older entry, which has had longer to be disputed', () => {
    const out = bestEntry([
      entry({ submittedBy: 'old', approvals: 2, createdAt: '2026-01-01' }),
      entry({ submittedBy: 'new', approvals: 2, createdAt: '2026-06-01' }),
    ]);
    expect(out.submittedBy).toBe('old');
  });
});

describe('rejectedBallsFor', () => {
  const e = o => ({ submittedBy: 'u1', approvals: 0, rejections: 0, createdAt: '2026-01-01', ...o });

  it('flags a ball whose only catalog entry was rejected', () => {
    const entries = { 'phaze ii': [e({ rejections: REJECTION_THRESHOLD })] };
    expect(rejectedBallsFor(['Phaze II'], entries, [])).toEqual(['Phaze II']);
  });

  it('stays quiet when another submission for that ball survived', () => {
    // There are still usable specs, so there's nothing to warn about.
    const entries = {
      'phaze ii': [e({ rejections: REJECTION_THRESHOLD }), e({ submittedBy: 'u2', approvals: 2 })],
    };
    expect(rejectedBallsFor(['Phaze II'], entries, [])).toEqual([]);
  });

  it('does not re-notify once acknowledged', () => {
    const entries = { 'phaze ii': [e({ rejections: REJECTION_THRESHOLD })] };
    expect(rejectedBallsFor(['Phaze II'], entries, ['phaze ii'])).toEqual([]);
  });

  it('matches the bowler\'s ball regardless of casing or spacing', () => {
    const entries = { 'phaze ii': [e({ rejections: REJECTION_THRESHOLD })] };
    expect(rejectedBallsFor(['PHAZE  ii'], entries, [])).toEqual(['PHAZE  ii']);
  });
});
