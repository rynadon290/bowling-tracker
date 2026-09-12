import { describe, it, expect } from 'vitest';
import {
  MIN_GAMES_FOR_ANALYSIS, SAMPLE_THRESHOLDS, meetsThreshold, shortfall,
  canAnalyze, gamesUntilAnalysis, buildAnalysisPayload, payloadIsEmpty,
  upcomingUnlocks,
  newlyUnlocked,
} from './insightGating.js';
import { scoreStats } from './scoreInsights.js';

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

// Insights was dead for anyone tracking game scores only -- and told them
// "no statistic has enough behind it", which reads as never rather than
// not yet. Game scores support real analysis.
describe('scores-only analysis', () => {
  const nights = n => Array.from({ length: n }, () => ({ bowler: 'R', scores: [200, 195, 168] }));
  const payloadFor = n => buildAnalysisPayload({
    gameCount: n * 3, sessionCount: n, firstBalls: 0, balls: [], centers: [],
    scoreStats: scoreStats(nights(n), 'R', 190),
  });

  it('gives a bowler with no shots a real payload', () => {
    const p = payloadFor(10);
    expect(payloadIsEmpty(p)).toBe(false);
    expect(Object.keys(p.included)).toContain('gamePosition');
    expect(Object.keys(p.included)).toContain('consistency');
  });

  it('invents no shot statistics for them', () => {
    expect(Object.keys(payloadFor(10).included)).not.toContain('strikeRate');
  });

  it('still withholds until the nights are there, and says how many short', () => {
    const p = payloadFor(4);
    expect(Object.keys(p.included)).not.toContain('gamePosition');
    expect(p.withheld.find(w => w.key === 'gamePosition').shortBy).toBe(4);
  });
});

describe('what unlocks next', () => {
  const payload = {
    included: {}, withheld: [
      { key: 'strikeRate', need: 150, have: 60, shortBy: 90 },
      { key: 'gamePosition', need: 8, have: 6, shortBy: 2 },
    ],
  };

  it('leads with whatever is closest', () => {
    expect(upcomingUnlocks(payload)[0].key).toBe('gamePosition');
  });

  // A stat key and its threshold key are not the same thing; getting this
  // wrong renders "8 more more".
  it('names the right unit for each statistic', () => {
    const u = upcomingUnlocks(payload);
    expect(u.find(x => x.key === 'gamePosition').unit).toBe('nights');
    expect(u.find(x => x.key === 'strikeRate').unit).toBe('first balls');
  });
});

describe('announcing a newly crossed threshold', () => {
  it('fires only on the transition', () => {
    expect(newlyUnlocked({ included: { a: {}, b: {} } }, 'a')).toHaveLength(1);
    expect(newlyUnlocked({ included: { a: {} } }, 'a')).toHaveLength(0);
  });

  // An existing bowler opening the app after this ships must not be told
  // everything they already had is new.
  it('says nothing on the very first evaluation', () => {
    expect(newlyUnlocked({ included: { a: {}, b: {} } }, null)).toHaveLength(0);
  });
});

describe('drills and patterns reach the analysis', () => {
  it('includes a drill target that has earned its sample', () => {
    const p = buildAnalysisPayload({ gameCount: 30, firstBalls: 0, balls: [], centers: [],
      drills: [{ label: '10 Pin', attempts: 40, rate: 75 }, { label: '7 Pin', attempts: 5, rate: 80 }] });
    expect(p.included.drills).toHaveLength(1);
    expect(p.withheld.some(w => w.key === 'drill:7 Pin')).toBe(true);
  });

  it('keeps oil patterns separate rather than blending them', () => {
    const p = buildAnalysisPayload({ gameCount: 30, firstBalls: 0, balls: [], centers: [],
      patterns: [{ name: 'House Shot', games: 12, average: 200 }, { name: 'Chameleon', games: 3, average: 170 }] });
    expect(p.included.patterns).toHaveLength(1);
    expect(p.included.patterns[0].name).toBe('House Shot');
  });
});

describe('the analysis grows with the sample', () => {
  // A bowler with 400 games used to get exactly the same four metrics as
  // one with 40. Each new metric gates on its own threshold, so the
  // analysis says more as more of it becomes true.
  const thin = {
    firstBalls: 30, strikeRate: 52, spareAttempts: 12, spareConversion: 60,
    singlePinAttempts: 5, singlePinRate: 80, sessionCount: 2,
    handedness: 'right-handed',
  };
  const rich = {
    firstBalls: 900, strikeRate: 54, spareAttempts: 400, spareConversion: 61,
    tenPinAttempts: 120, tenPinRate: 62, splitRate: 18,
    singlePinAttempts: 200, singlePinRate: 78,
    cornerPinAttempts: 120, cornerPinRate: 62,
    frameCount: 900, openFramesPerGame: 1.8,
    completeSets: 140, averageByPosition: [192, 188, 186],
    scoreSpread: 24, sessionCount: 144, mostCommonLeave: 'p7',
    handedness: 'left-handed',
  };

  it('claims almost nothing from a thin sample', () => {
    const p = buildAnalysisPayload(thin);
    expect(p.included.singlePinRate).toBeUndefined();
    expect(p.included.strikeRate).toBeUndefined();
  });

  it('reports each metric once its own threshold is met', () => {
    const p = buildAnalysisPayload(rich);
    for (const k of ['singlePinRate', 'cornerPinRate', 'openFramesPerGame',
                     'averageByPosition', 'scoreSpread', 'mostCommonLeave']) {
      expect(p.included[k]).toBeDefined();
    }
  });

  // Handedness is context, not a claim. Without it the analysis reasons
  // about ten-pin conversion without knowing whether the ten pin is even
  // this bowler's corner -- for a lefty it is the seven.
  it('always includes handedness, at any sample size', () => {
    expect(buildAnalysisPayload(thin).included.handedness.value).toBe('right-handed');
    expect(buildAnalysisPayload(rich).included.handedness.value).toBe('left-handed');
  });

  it('never gates handedness by sample', () => {
    expect(buildAnalysisPayload({ handedness: 'left-handed' }).included.handedness).toBeDefined();
  });

  it('says how far short a withheld metric is', () => {
    const p = buildAnalysisPayload(thin);
    const w = p.withheld.find(x => x.key === 'singlePinRate');
    expect(w.shortBy).toBe(20);
  });
});

describe('baselines and drills', () => {
  // An average IS the sample -- there is no threshold at which "you
  // average 189" becomes true.
  it('never gates the baselines', () => {
    const p = buildAnalysisPayload({
      average: 189, bookAverage: 186, highGame: 279, highSeries: 721,
      gamesLogged: 432, nightsLogged: 144, firstBalls: 1,
    });
    for (const k of ['average', 'bookAverage', 'highGame', 'highSeries', 'gamesLogged', 'nightsLogged']) {
      expect(p.included[k]).toBeDefined();
    }
  });

  it('leaves a baseline out entirely when it is not known', () => {
    const p = buildAnalysisPayload({ average: 189 });
    expect(p.included.average).toBeDefined();
    expect(p.included.bookAverage).toBeUndefined();
  });

  // The consumer was written and gated at 25 attempts, and nothing ever
  // fed it -- so the practice group's richest data reached neither the
  // analysis nor the genie.
  it('reports a drill target with enough attempts', () => {
    const p = buildAnalysisPayload({ drills: [{ label: '10pin', attempts: 120, rate: 78 }] });
    expect(p.included.drills).toEqual([{ target: '10pin', conversion: 78, sampleSize: 120 }]);
  });

  it('withholds a thin drill target and says how short it is', () => {
    const p = buildAnalysisPayload({ drills: [{ label: '7pin', attempts: 8, rate: 50 }] });
    expect(p.included.drills).toBeUndefined();
    expect(p.withheld.find(w => w.key === 'drill:7pin').shortBy).toBe(17);
  });

  it('survives junk drills', () => {
    for (const junk of [null, undefined, 'x', 42, [null]]) {
      expect(() => buildAnalysisPayload({ drills: junk })).not.toThrow();
    }
  });
});
