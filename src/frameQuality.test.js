import { describe, it, expect } from 'vitest';
import { frameQualityScore } from './BowlingTracker.jsx';

function leave(pins, spareMade) {
  return { result: 'Other Leave', otherLeave: pins, spareMade };
}

describe('frameQualityScore — strict tier ordering', () => {
  it('a strike always scores exactly 100', () => {
    expect(frameQualityScore({ result: 'Strike' })).toBe(100);
  });

  it('a non-split spare scores in the 70-89 band', () => {
    const score = frameQualityScore(leave(['7'], 'Yes'));
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(89);
  });

  it('a split spare scores in the 50-69 band, strictly below any non-split spare', () => {
    const splitSpare = frameQualityScore(leave(['7', '10'], 'Yes'));
    const nonSplitSpare = frameQualityScore(leave(['7'], 'Yes'));
    expect(splitSpare).toBeGreaterThanOrEqual(50);
    expect(splitSpare).toBeLessThanOrEqual(69);
    expect(splitSpare).toBeLessThan(nonSplitSpare);
  });

  it('no open frame can ever outscore any spare, regardless of pin count', () => {
    const bestPossibleOpen = frameQualityScore({ result: 'Other Leave', otherLeave: ['7'], spareMade: 'No', pinCount: '9' });
    const worstPossibleSplitSpare = frameQualityScore(leave(['7', '10'], 'Yes'));
    expect(bestPossibleOpen).toBeLessThan(worstPossibleSplitSpare);
  });

  it('within the non-split spare tier, fewer pins left standing on ball 1 scores higher', () => {
    // 7 alone: first ball = 9 (only 1 pin left standing).
    // 2-8 together: first ball = 8 (2 pins left standing) — confirmed
    // non-split (same column, no gap), so this is a clean same-tier
    // comparison isolating just the pin-count effect.
    const oneStanding = frameQualityScore(leave(['7'], 'Yes'));
    const twoStandingNonSplit = frameQualityScore(leave(['2', '8'], 'Yes'));
    expect(oneStanding).toBeGreaterThan(twoStandingNonSplit);
    expect(twoStandingNonSplit).toBeGreaterThanOrEqual(70);
    expect(twoStandingNonSplit).toBeLessThanOrEqual(89);
  });
});
