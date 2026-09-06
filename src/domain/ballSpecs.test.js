import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BALL_GROUPS, emptyBallSpecs, normalizeBallSpecs, setSpecField,
  describeSpecs, groupBalls, specsToRow, specsFromRow,
} from './ballSpecs.js';

describe('intermediate differential is asymmetric-only', () => {
  it('clears int diff when a ball is switched to symmetric', () => {
    // A symmetric ball has no intermediate differential. Leaving a stale
    // value behind would read as fact on a spec sheet later.
    let s = setSpecField(emptyBallSpecs(), 'coreType', 'asymmetric');
    s = setSpecField(s, 'intDiff', '0.021');
    expect(s.intDiff).toBe('0.021');
    s = setSpecField(s, 'coreType', 'symmetric');
    expect(s.intDiff).toBe('');
  });

  it('drops a stored int diff on a symmetric ball during normalization', () => {
    expect(normalizeBallSpecs({ coreType: 'symmetric', intDiff: '0.021' }).intDiff).toBe('');
  });

  it('writes NULL for int diff on symmetric balls', () => {
    expect(specsToRow({ ...emptyBallSpecs(), coreType: 'symmetric', intDiff: '0.021' }).int_diff).toBeNull();
  });
});

describe('describeSpecs', () => {
  it('summarises a full asymmetric ball', () => {
    expect(describeSpecs({ weight: '15', coverstock: 'solid', coreType: 'asymmetric', rg: '2.47', diff: '0.055', intDiff: '0.021' }))
      .toBe('15lb · Solid · Asymmetric · RG 2.47 / Diff 0.055 / Int 0.021');
  });

  it('omits int diff for a symmetric ball even if one is present', () => {
    expect(describeSpecs({ weight: '15', coverstock: 'pearl', coreType: 'symmetric', rg: '2.50', diff: '0.040', intDiff: '0.02' }))
      .toBe('15lb · Pearl · Symmetric · RG 2.50 / Diff 0.040');
  });

  it('returns blank when nothing is filled in', () => {
    expect(describeSpecs(emptyBallSpecs())).toBe('');
  });
});

describe('groupBalls', () => {
  const balls = ['A', 'B', 'C', 'D'];
  const groups = [{ id: 'g1', name: 'Strong - Smooth' }, { id: 'g2', name: 'Urethane' }];
  const specs = {
    A: { groupId: 'g1', coverstock: 'solid', coreType: 'asymmetric' },
    B: { groupId: 'g1', coverstock: 'pearl', coreType: 'symmetric' },
    C: { groupId: 'g2', coverstock: 'solid', coreType: 'symmetric' },
    D: { groupId: '', coverstock: '', coreType: '' },
  };

  it('buckets by the bowler\'s own groups', () => {
    const out = groupBalls('group', balls, specs, groups);
    expect(out.map(g => g.label)).toEqual(['Strong - Smooth', 'Urethane', 'Ungrouped']);
    expect(out[0].balls).toEqual(['A', 'B']);
  });

  it('never drops an unclassified ball', () => {
    // Every ball must stay reachable, or it becomes invisible in the UI.
    const out = groupBalls('group', balls, specs, groups);
    expect(out.find(g => g.label === 'Ungrouped').balls).toEqual(['D']);
  });

  it('puts a ball whose group was deleted into Ungrouped', () => {
    const out = groupBalls('group', ['A'], { A: { groupId: 'deleted-id' } }, groups);
    expect(out.map(g => g.label)).toEqual(['Ungrouped']);
  });

  it('groups by coverstock and core without any setup', () => {
    expect(groupBalls('coverstock', balls, specs, groups).map(g => g.label))
      .toEqual(['Solid', 'Pearl', 'Not specified']);
    expect(groupBalls('core', balls, specs, groups).map(g => g.label))
      .toEqual(['Symmetric', 'Asymmetric', 'Not specified']);
  });

  it('hides empty buckets', () => {
    expect(groupBalls('group', ['A'], { A: { groupId: 'g1' } }, groups).map(g => g.label))
      .toEqual(['Strong - Smooth']);
  });
});

describe('defaults and round trip', () => {
  it('seeds the seven standard groups', () => {
    expect(DEFAULT_BALL_GROUPS).toHaveLength(7);
    expect(DEFAULT_BALL_GROUPS).toContain('Urethane');
  });

  it('round-trips every spec field', () => {
    const full = { groupId: 'g1', coverstock: 'hybrid', coreType: 'asymmetric', weight: '15', rg: '2.48', diff: '0.054', intDiff: '0.018' };
    expect(specsFromRow(specsToRow(full))).toEqual(full);
  });
});
