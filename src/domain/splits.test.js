import { describe, it, expect } from 'vitest';
import { isSplit, isTenPinLeave, isSinglePinLeave, isWashout, isMakeableSpare } from './splits.js';

function leave(pins) {
  return { result: 'Other Leave', otherLeave: pins };
}

describe('isSplit — recognized splits', () => {
  it('7-10 (the bedposts) is a split', () => {
    expect(isSplit(leave(['7', '10']))).toBe(true);
  });

  it('4-6 (gap where 5 was) is a split', () => {
    expect(isSplit(leave(['4', '6']))).toBe(true);
  });

  it('5-7 is a split', () => {
    expect(isSplit(leave(['5', '7']))).toBe(true);
  });

  it('5-10 is a split', () => {
    expect(isSplit(leave(['5', '10']))).toBe(true);
  });

  it('2-7-3-10 (the "big four") is a split', () => {
    expect(isSplit(leave(['2', '7', '3', '10']))).toBe(true);
  });

  // This app's split definition is intentionally broader than the strict
  // USBC rule (which requires a downed pin physically between the two
  // standing pins). Any 2+ pins sharing a row with nothing standing in a
  // lower row counts as a split here — including immediately adjacent
  // pairs within a row, where the stricter definition would say there's no
  // pin "missing" between them to count. This is a deliberate choice, not
  // an oversight — confirmed directly rather than assumed.
  it('adjacent same-row pairs (e.g. 8-9, 2-3) count as splits under this app\'s definition', () => {
    expect(isSplit(leave(['8', '9']))).toBe(true);
    expect(isSplit(leave(['2', '3']))).toBe(true);
    expect(isSplit(leave(['4', '5']))).toBe(true);
    expect(isSplit(leave(['9', '10']))).toBe(true);
  });
});

describe('isSplit — not splits', () => {
  it('a single pin standing is never a split, regardless of which pin', () => {
    expect(isSplit(leave(['10']))).toBe(false);
    expect(isSplit(leave(['7']))).toBe(false);
  });

  it('9 Pin No-Tap is never a split — it is scored as a strike, not a real leave', () => {
    expect(isSplit(leave(['9 Pin No-Tap']))).toBe(false);
  });

  it('the headpin standing rules out a split regardless of what else is standing', () => {
    expect(isSplit(leave(['1', '2', '3']))).toBe(false);
    expect(isSplit(leave(['1', '10']))).toBe(false);
  });

  it('a non-"Other Leave" result is never a split', () => {
    expect(isSplit({ result: 'Strike' })).toBe(false);
    expect(isSplit({ result: 'Weak 10', otherLeave: [] })).toBe(false);
  });

  it('a fully-covered rack (empty leave) is not a split', () => {
    expect(isSplit(leave([]))).toBe(false);
  });
});


describe('isTenPinLeave', () => {
  it('Weak 10 counts as a ten-pin leave', () => {
    expect(isTenPinLeave({ result: 'Weak 10' })).toBe(true);
  });

  it('Ringing 10 counts as a ten-pin leave', () => {
    expect(isTenPinLeave({ result: 'Ringing 10' })).toBe(true);
  });

  it('"Other Leave" with only pin 10 standing counts as a ten-pin leave', () => {
    expect(isTenPinLeave(leave(['10']))).toBe(true);
  });

  it('any other single-pin leave does not count', () => {
    expect(isTenPinLeave(leave(['7']))).toBe(false);
  });

  it('a strike is not a ten-pin leave', () => {
    expect(isTenPinLeave({ result: 'Strike' })).toBe(false);
  });
});

describe('isSinglePinLeave', () => {
  it('exactly one pin standing counts', () => {
    expect(isSinglePinLeave(leave(['7']))).toBe(true);
  });

  it('two or more pins standing does not count', () => {
    expect(isSinglePinLeave(leave(['7', '10']))).toBe(false);
  });

  it('9 Pin No-Tap is excluded — it is not treated as a real leave at all', () => {
    expect(isSinglePinLeave(leave(['9 Pin No-Tap']))).toBe(false);
  });
});

describe('isWashout', () => {
  it('1-2-10 (classic washout, 3-pin down) is a washout', () => {
    expect(isWashout(leave(['1', '2', '10']))).toBe(true);
  });
  it('1-6 with 3-pin down is a washout', () => {
    expect(isWashout(leave(['1', '6']))).toBe(true);
  });
  it('1-6-10 with 3-pin down is a washout', () => {
    expect(isWashout(leave(['1', '6', '10']))).toBe(true);
  });
  it('1-3-6 — 3-pin STILL standing — is NOT a washout', () => {
    expect(isWashout(leave(['1', '3', '6']))).toBe(false);
  });
  it('1-3-10 — 3-pin still standing — is NOT a washout', () => {
    expect(isWashout(leave(['1', '3', '10']))).toBe(false);
  });
  it('headpin alone (no 6 or 10) is NOT a washout', () => {
    expect(isWashout(leave(['1']))).toBe(false);
  });
  it('6-10 without the headpin is NOT a washout', () => {
    expect(isWashout(leave(['6', '10']))).toBe(false);
  });
  it('a strike is not a washout', () => {
    expect(isWashout({ result: 'Strike', otherLeave: [] })).toBe(false);
  });
  it('mirrors correctly for a left-handed bowler: 1-7 with 2-pin down is a washout', () => {
    expect(isWashout(leave(['1', '7']), true)).toBe(true);
  });
  it('for a lefty, 1-2-7 with the 2-pin still standing is NOT a washout', () => {
    expect(isWashout(leave(['1', '2', '7']), true)).toBe(false);
  });
  it('for a lefty, the same 1-6 leave that is a righty washout is NOT a washout', () => {
    expect(isWashout(leave(['1', '6']), true)).toBe(false);
  });
});

describe('isMakeableSpare', () => {
  it('a simple single-pin leave is makeable', () => {
    expect(isMakeableSpare(leave(['7']))).toBe(true);
  });
  it('a washout is not makeable', () => {
    expect(isMakeableSpare(leave(['1', '6']))).toBe(false);
  });
  it('a split is not makeable', () => {
    expect(isMakeableSpare(leave(['7', '10']))).toBe(false);
  });
  it('a strike is not evaluated as makeable at all', () => {
    expect(isMakeableSpare({ result: 'Strike', otherLeave: [] })).toBe(false);
  });
  it('a Weak 10 (lone 10-pin) is always makeable', () => {
    expect(isMakeableSpare({ result: 'Weak 10', otherLeave: [] })).toBe(true);
  });
  it('a Ringing 10 (lone 10-pin) is always makeable', () => {
    expect(isMakeableSpare({ result: 'Ringing 10', otherLeave: [] })).toBe(true);
  });
});
