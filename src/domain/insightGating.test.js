import { describe, it, expect } from 'vitest';
import {
  MIN_GAMES_FOR_ANALYSIS, SAMPLE_THRESHOLDS, meetsThreshold, shortfall,
  canAnalyze, gamesUntilAnalysis, buildAnalysisPayload, payloadIsEmpty,
} from './insightGating.js';

describe('analysis floor', () => {
  it('refuses to analyse below the minimum game count', () => {
    // Below this even overall strike rate carries a ±10% confidence
    // interval -- there is nothing worth saying, at any price.
    expect(canAnalyze(MIN_GAMES_FOR_ANALYSIS - 1)).toBe(false);
    expect(canAnalyze(MIN_GAMES_FOR_ANALYSIS)).toBe(true);
  });

  it('reports how many games remain', () => {
    expect(gamesUntilAnalysis(3)).toBe(MIN_GAMES_FOR_ANALYSIS - 3);
    expect(gamesUntilAnalysis(999)).toBe(0);
  });
});

describe('per-statistic thresholds', () => {
  it('sets the highest bar on ball comparison', () => {
    // Comparing two proportions compounds both their errors, so a ball
    // needs far more data before it can be compared than an overall rate
    // needs before it can be reported.
    expect(SAMPLE_THRESHOLDS.ballComparison).toBeGreaterThan(SAMPLE_THRESHOLDS.overallStrikeRate);
    expect(SAMPLE_THRESHOLDS.ballComparison).toBeGreaterThan(SAMPLE_THRESHOLDS.spareConversion);
  });

  it('fails safe for an unrecognised statistic', () => {
    expect(meetsThreshold('not-a-real-stat', 1e6)).toBe(false);
  });

  it('reports the shortfall so the UI can explain the wait', () => {
    expect(shortfall('ballComparison', 100)).toBe(SAMPLE_THRESHOLDS.ballComparison - 100);
  });
});

describe('buildAnalysisPayload', () => {
  const thirtyGames = {
    gameCount: 30, firstBalls: 300, strikeRate: 0.52,
    spareAttempts: 135, spareConversion: 0.71,
    balls: [
      { name: 'Phaze II', firstBalls: 100, strikeRate: 0.55 },
      { name: 'Bionic', firstBalls: 100, strikeRate: 0.48 },
    ],
  };

  it('includes overall rates but withholds ball comparison at 30 games', () => {
    // The case that matters: 30 games looks like plenty, but split across
    // a rotation it cannot distinguish a 7-point carry difference from
    // chance. Sending it would produce a confident story about noise.
    const p = buildAnalysisPayload(thirtyGames);
    expect(p.included.strikeRate).toBeDefined();
    expect(p.included.balls).toBeUndefined();
    expect(p.canCompareBalls).toBe(false);
  });

  it('explains what was withheld and by how much', () => {
    const p = buildAnalysisPayload(thirtyGames);
    const held = p.withheld.find(w => w.key === 'ball:Phaze II');
    expect(held.shortBy).toBe(SAMPLE_THRESHOLDS.ballComparison - 100);
  });

  it('includes balls once each has earned its own sample', () => {
    const p = buildAnalysisPayload({
      ...thirtyGames, gameCount: 80,
      balls: [
        { name: 'Phaze II', firstBalls: 300, strikeRate: 0.58 },
        { name: 'Bionic', firstBalls: 280, strikeRate: 0.49 },
        { name: 'Brand New', firstBalls: 40, strikeRate: 0.60 },
      ],
    });
    expect(p.included.balls.map(b => b.name)).toEqual(['Phaze II', 'Bionic']);
    expect(p.canCompareBalls).toBe(true);
  });

  it('attaches sample sizes so claims can be qualified honestly', () => {
    expect(buildAnalysisPayload(thirtyGames).included.strikeRate.sampleSize).toBe(300);
  });

  it('will not present a single center as a comparison', () => {
    const p = buildAnalysisPayload({
      ...thirtyGames,
      centers: [{ name: 'Arsenal Bowl', games: 30, average: 200 }],
    });
    expect(p.included.centers).toBeUndefined();
  });

  it('drops null values even when the sample is large', () => {
    const p = buildAnalysisPayload({ gameCount: 50, firstBalls: 500, strikeRate: null, balls: [] });
    expect(p.included.strikeRate).toBeUndefined();
  });

  it('flags a payload with nothing worth sending', () => {
    // No request should be made at all in this case.
    const p = buildAnalysisPayload({ gameCount: 12, firstBalls: 120, strikeRate: 0.5, balls: [] });
    expect(payloadIsEmpty(p)).toBe(true);
  });
});
