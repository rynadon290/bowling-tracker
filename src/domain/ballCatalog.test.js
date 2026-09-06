import { describe, it, expect } from 'vitest';
import {
  catalogState, isLocked, canEdit, canVote, approvalsUntilNext,
  stateDescription, clearedSpecsAfterRejection, ballKey, bestEntry,
  APPROVAL_THRESHOLD, VERIFICATION_THRESHOLD, REJECTION_THRESHOLD,
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

  it('lets rejection override even a heavily-approved entry', () => {
    // If three people say the numbers are wrong, a pile of earlier
    // approvals doesn't make them right -- the entry needs redoing.
    expect(catalogState(entry({ approvals: 20, rejections: 3 }))).toBe('rejected');
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

  it('stops voting once an entry is rejected', () => {
    expect(canVote(entry({ rejections: REJECTION_THRESHOLD }), 'u2')).toBe(false);
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
