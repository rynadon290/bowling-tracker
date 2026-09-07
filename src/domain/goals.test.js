import { describe, it, expect } from 'vitest';
import {
  goalType, minSampleFor, normalizeGoal, normalizeGoals,
  setGoal, removeGoal, goalProgress, allGoalProgress, goalsToRow, goalsFromRow,
} from './goals.js';
import { SAMPLE_THRESHOLDS } from './insightGating.js';
import { rAvg, cAvg, bowlerHighGame, bowlerHighSeries } from './stats.js';

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
  // The bug this guards: goalsToRow wrote `user_id` while the migration
  // created `created_by`, so every save failed with PGRST204 ("could not
  // find the column in the schema cache"). Nothing in the previous tests
  // compared the app's column names against the actual table definition,
  // so the mismatch was invisible until it hit a real database.
  it('writes created_by, matching the column the migration creates', () => {
    const row = goalsToRow([], 'Ryan', 'user-1');
    expect(row.created_by).toBe('user-1');
    expect('user_id' in row).toBe(false);
  });

  it('writes no column the table does not have', () => {
    const row = goalsToRow([{ typeId: 'average', target: 190 }], 'Ryan', 'user-1');
    // Mirrors migration_bowler_goals.sql. If a column is added there, add
    // it here too -- the point is that the two are compared at all.
    const tableColumns = ['id', 'created_by', 'bowler_name', 'goals', 'created_at', 'updated_at'];
    for (const written of Object.keys(row)) {
      expect(tableColumns).toContain(written);
    }
  });

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

// Guards the wiring between stats.js and goals, which is where the first
// version of this feature broke: every score goal reported "nothing
// logged" because of three separate mismatches with the stats helpers.
describe('score measurements sourced from stats.js', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Tuesday House Shot', date: '2026-06-02', scores: [210, 190, 200], total: 600 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-06-04', scores: [180, 240, 170], total: 590 },
  ];

  it('bowlerHighGame returns an object, so .value must be unwrapped', () => {
    const hg = bowlerHighGame(sessions, 'Ryan');
    expect(typeof hg).toBe('object');
    // Passing the object straight to goalProgress is what produced
    // "nothing logged" -- Number.isFinite({}) is false.
    expect(goalProgress({ typeId: 'highGame', target: 250 }, hg, 1).noData).toBe(true);
    expect(goalProgress({ typeId: 'highGame', target: 250 }, hg.value, 1).current).toBe(240);
  });

  it('rAvg returns null for the all-leagues view, so cAvg is the right source', () => {
    expect(rAvg(sessions, 'Ryan', '')).toBeNull();
    expect(cAvg(sessions, 'Ryan', '')).toBe(198);
  });

  it('produces real progress for every score goal in the default view', () => {
    const hg = bowlerHighGame(sessions, 'Ryan');
    const hs = bowlerHighSeries(sessions, 'Ryan');
    expect(goalProgress({ typeId: 'average', target: 200 }, cAvg(sessions, 'Ryan', ''), 1).noData).toBeUndefined();
    expect(goalProgress({ typeId: 'highGame', target: 250 }, hg.value, 1).current).toBe(240);
    expect(goalProgress({ typeId: 'highSeries', target: 600 }, hs.value, 1).met).toBe(true);
  });
});

// Guards the offline path. A goal saved without a connection lives in the
// sync queue until it flushes; loading must not let the older cloud copy
// overwrite it.
describe('merging queued writes over cloud rows on load', () => {
  // Mirrors the load logic in BowlingTracker.jsx.
  function mergeOnLoad(cloudRows, queuedRows) {
    const pending = new Set(queuedRows.map(r => r.bowler_name));
    const out = {};
    cloudRows.filter(r => !pending.has(r.bowler_name)).forEach(r => { out[r.bowler_name] = goalsFromRow(r); });
    queuedRows.forEach(r => { out[r.bowler_name] = goalsFromRow(r); });
    return out;
  }

  const cloud = [{ bowler_name: 'Ryan', goals: [{ typeId: 'average', target: 180 }] }];
  const queued = [{ bowler_name: 'Ryan', goals: [{ typeId: 'average', target: 200 }, { typeId: 'highGame', target: 250 }] }];

  it('keeps the unsynced goal rather than reverting to the cloud copy', () => {
    const merged = mergeOnLoad(cloud, queued);
    expect(merged.Ryan.find(g => g.typeId === 'average').target).toBe(200);
  });

  it('keeps a goal that exists only in the queue', () => {
    expect(mergeOnLoad(cloud, queued).Ryan).toHaveLength(2);
  });

  it('leaves other bowlers untouched', () => {
    const withSam = [...cloud, { bowler_name: 'Sam', goals: [{ typeId: 'average', target: 170 }] }];
    expect(mergeOnLoad(withSam, queued).Sam[0].target).toBe(170);
  });

  it('falls back to the cloud rows when nothing is queued', () => {
    expect(mergeOnLoad(cloud, []).Ryan[0].target).toBe(180);
  });
});
