import { describe, it, expect } from 'vitest';
import { isSplit, isTenPinLeave, isSinglePinLeave, isWashout, isMakeableSpare,
  mirrorPin,
  mirrorLeave,
  cornerPinLabel,
  splitConversionByType,
  splitName,
} from './splits.js';

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

// The user's exact framing: comparing a lefty and righty needs the WHOLE
// rack mirrored, not just the two corners. Verified against every pair
// they named, plus the two pins on the centerline that mirror to
// themselves.
describe('full-rack mirroring', () => {
  it('mirrors every named pair both ways', () => {
    for (const [a, b] of [[7, 10], [8, 9], [4, 6], [2, 3]]) {
      expect(mirrorPin(a)).toBe(b);
      expect(mirrorPin(b)).toBe(a);
    }
  });

  it('leaves the centerline pins (1 and 5) unchanged', () => {
    expect(mirrorPin(1)).toBe(1);
    expect(mirrorPin(5)).toBe(5);
  });

  it('mirrors a whole leave in one call', () => {
    expect(mirrorLeave(['2', '4', '10'])).toEqual(['3', '6', '7']);
  });

  it('passes the no-tap sentinel through untouched -- it names an outcome, not a pin', () => {
    expect(mirrorLeave(['9 Pin No-Tap'])).toEqual(['9 Pin No-Tap']);
  });

  it('keeps the corner-pin case working through the general primitive', () => {
    expect(cornerPinLabel(true)).toBe('7');
    expect(cornerPinLabel(false)).toBe('10');
  });
});

// isSplit takes the SHOT, not its leave array. Passing the array meant
// shot.result was undefined, the first check failed, and it returned
// false for every shot -- Insights reported a 0% split rate forever while
// Stats showed the true number.
describe('isSplit argument shape', () => {
  const realSplit = { result: 'Other Leave', otherLeave: ['4', '7', '10'] };

  it('recognises a split from the shot', () => {
    expect(isSplit(realSplit)).toBe(true);
  });

  it('returns false when handed a bare leave array', () => {
    // Documents the trap rather than endorsing it: this is the shape that
    // silently zeroed the count.
    expect(isSplit(realSplit.otherLeave)).toBe(false);
  });

  it('counts correctly when filtering shots directly', () => {
    const shots = [realSplit, realSplit, { result: 'Strike', otherLeave: [] }];
    expect(shots.filter(isSplit)).toHaveLength(2);
  });
});

// An overall split conversion rate hides what a bowler needs to know:
// the 4-7-10 and the 3-10 are not the same problem. Someone converting
// every baby split and no big ones reads the same as the reverse.
describe('splitConversionByType', () => {
  const mk = (leave, made) => ({ result: 'Other Leave', otherLeave: leave, spareMade: made });

  it('separates split types', () => {
    const r = splitConversionByType([mk(['3', '10'], 'Yes'), mk(['7', '10'], 'No')]);
    expect(r.map(x => x.key).sort()).toEqual(['3-10', '7-10']);
  });

  it('computes conversion per type', () => {
    const r = splitConversionByType([mk(['3', '10'], 'Yes'), mk(['3', '10'], 'Yes'), mk(['3', '10'], 'No')]);
    expect(r[0]).toMatchObject({ key: '3-10', left: 3, made: 2, rate: 67 });
  });

  // Leaves are stored as strings; a naive sort puts "10" before "3".
  it('merges the same split regardless of pin order', () => {
    const r = splitConversionByType([mk(['3', '10'], 'Yes'), mk(['10', '3'], 'No')]);
    expect(r).toHaveLength(1);
    expect(r[0].left).toBe(2);
  });

  it('names the well-known splits', () => {
    expect(splitName('3-10')).toBe('Baby split');
    expect(splitName('4-6-7-10')).toBe('Big four');
    expect(splitName('7-10')).toBe('7-10');
    expect(splitName('2-4-10')).toBe('2-4-10');
  });

  it('falls back to the pins for an unnamed split', () => {
    expect(splitName('5-7-10')).toBe('5-7-10');
  });

  it('ignores leaves that are not splits', () => {
    const r = splitConversionByType([mk(['10'], 'Yes'), mk(['2', '4', '5'], 'No')]);
    expect(r).toHaveLength(0);
  });

  it('orders by how often each is left', () => {
    const r = splitConversionByType([
      mk(['7', '10'], 'No'),
      mk(['3', '10'], 'Yes'), mk(['3', '10'], 'No'), mk(['3', '10'], 'Yes'),
    ]);
    expect(r[0].key).toBe('3-10');
  });

  it('handles nothing', () => {
    expect(splitConversionByType([])).toEqual([]);
    expect(splitConversionByType(null)).toEqual([]);
  });
});
