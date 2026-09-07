import { describe, it, expect } from 'vitest';
import {
  goalType, minSampleFor, normalizeGoal, normalizeGoals,
  setGoal, removeGoal, goalProgress, allGoalProgress, goalsToRow, goalsFromRow,
} from './goals.js';
import { SAMPLE_THRESHOLDS } from './insightGating.js';

describe('sample thresholds', () => {
  // These must stay wired to insightGating rather than copied, or the two
  // can drift and a goal starts reporting on a sample the rest of the app
  // considers too thin.
  it('reuses the shared thresholds rather than duplicating them', () => {
    expect(minSampleFor(goalType('strikeRate'))).toBe(SAMPLE_THRESHOLDS.overallStrikeRate);
    expect(minSampleFor(goalType('spareRate'))).toBe(SAMPLE_THRESHOLDS.spareConversion);
    expect(minSampleFor(goalType('singlePinSpareRate'))).toBe(SAMPLE_THRESHOLDS.specificLeave);
  });

  it('leaves score-based goals ungated, since they are facts not estimates', () => {
    expect(minSampleFor(goalType('average'))).toBe(0);
    expect(minSampleFor(goalType('highGame'))).toBe(0);
    expect(minSampleFor(goalType('highSeries'))).toBe(0);
  });
});

describe('validating a target', () => {
  it('rejects an out-of-range target rather than silently clamping it', () => {
    expect(normalizeGoal({ typeId: 'average', target: 3000 })).toBeNull();
    expect(normalizeGoal({ typeId: 'average', target: 10 })).toBeNull();
    expect(normalizeGoal({ typeId: 'strikeRate', target: 150 })).toBeNull();
  });

  it('rejects unknown statistics and non-numeric targets', () => {
    expect(normalizeGoal({ typeId: 'nope', target: 50 })).toBeNull();
    expect(normalizeGoal({ typeId: 'average', target: 'abc' })).toBeNull();
  });

  it('rounds a fractional target to whole units', () => {
    expect(normalizeGoal({ typeId: 'average', target: 189.6 }).target).toBe(190);
  });

  it('allows a 900 series', () => {
    expect(normalizeGoal({ typeId: 'highSeries', target: 900 }).target).toBe(900);
  });
});

describe('one goal per statistic', () => {
  it('dedupes, keeping the first', () => {
    const g = normalizeGoals([{ typeId: 'average', target: 180 }, { typeId: 'average', target: 200 }]);
    expect(g).toHaveLength(1);
    expect(g[0].target).toBe(180);
  });

  it('setGoal replaces an existing target instead of adding a second', () => {
    const g = setGoal(setGoal([], 'average', 180), 'average', 200);
    expect(g).toHaveLength(1);
    expect(g[0].target).toBe(200);
  });

  it('setGoal ignores an invalid target', () => {
    expect(setGoal([], 'average', 9999)).toHaveLength(0);
  });

  it('removeGoal removes it', () => {
    expect(removeGoal(setGoal([], 'average', 180), 'average')).toHaveLength(0);
  });
});

describe('progress and sample gating', () => {
  const goal = { typeId: 'strikeRate', target: 60 };

  it('reports no number at all below the threshold', () => {
    const p = goalProgress(goal, 62, 11);
    expect(p.gated).toBe(true);
    expect(p.current).toBeNull();
    expect(p.pct).toBeNull();
    // Crucially not "met", even though 62 > 60 -- the 62 isn't trustworthy.
    expect(p.met).toBe(false);
  });

  it('says how much more data the gated goal needs', () => {
    const p = goalProgress(goal, 62, 11);
    expect(p.remaining).toBe(SAMPLE_THRESHOLDS.overallStrikeRate - 11);
    expect(p.sampleNoun).toBe('first balls');
  });

  it('reports a real number once the sample is there', () => {
    const p = goalProgress(goal, 62, 200);
    expect(p.gated).toBe(false);
    expect(p.current).toBe(62);
    expect(p.met).toBe(true);
  });

  it('measures progress from zero and caps at 100', () => {
    expect(goalProgress(goal, 45, 200).pct).toBe(Math.round((45 / 60) * 100));
    expect(goalProgress(goal, 90, 200).pct).toBe(100);
  });

  it('reports how far short, and nothing once met', () => {
    expect(goalProgress(goal, 45, 200).shortBy).toBe(15);
    expect(goalProgress(goal, 62, 200).shortBy).toBeNull();
  });

  it('lets a score goal report off a single game', () => {
    const p = goalProgress({ typeId: 'highGame', target: 250 }, 268, 1);
    expect(p.gated).toBe(false);
    expect(p.met).toBe(true);
  });

  it('distinguishes no data from zero progress', () => {
    const p = goalProgress({ typeId: 'average', target: 190 }, null, 5);
    expect(p.noData).toBe(true);
    expect(p.pct).toBeNull();
    expect(p.met).toBe(false);
  });
});

describe('listing progress', () => {
  it('orders by the canonical list, not by insertion order', () => {
    const p = allGoalProgress(
      [{ typeId: 'cleanFrameRate', target: 80 }, { typeId: 'average', target: 190 }],
      { average: { current: 185, sample: 1 }, cleanFrameRate: { current: 70, sample: 500 } },
    );
    expect(p[0].typeId).toBe('average');
  });

  it('ignores measurements for statistics with no goal set', () => {
    expect(allGoalProgress([], { average: { current: 200, sample: 99 } })).toHaveLength(0);
  });
});

describe('supabase mapping', () => {
  it('round-trips', () => {
    const row = goalsToRow([{ typeId: 'average', target: 190 }], 'Ryan', 'u1');
    expect(row.bowler_name).toBe('Ryan');
    expect(goalsFromRow(row)[0].target).toBe(190);
  });

  it('survives a malformed row', () => {
    expect(goalsFromRow(null)).toEqual([]);
    expect(goalsFromRow({ goals: 'nonsense' })).toEqual([]);
  });
});
