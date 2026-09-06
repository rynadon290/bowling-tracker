import { describe, it, expect } from 'vitest';
import {
  LAYOUT_SYSTEMS, LAYOUT_FIELDS, emptyLayout, normalizeLayout,
  isLayoutComplete, layoutFieldErrors, formatLayout, setLayoutSystem, setLayoutValue,
} from './layouts.js';

describe('layout systems', () => {
  it('supports the three systems, each with three fields', () => {
    expect(LAYOUT_SYSTEMS).toEqual(['dual_angle', 'vls', '2ls']);
    for (const s of LAYOUT_SYSTEMS) expect(LAYOUT_FIELDS[s]).toHaveLength(3);
  });

  it('gives each system its own distinct reference points, not generic numbers', () => {
    // This is the whole reason layouts can't share one form: the three
    // numbers measure different things in each system.
    expect(LAYOUT_FIELDS.dual_angle.map(f => f.key)).toEqual(['drillingAngle', 'pinToPap', 'valAngle']);
    expect(LAYOUT_FIELDS.vls.map(f => f.key)).toEqual(['pinToPap', 'psaToPap', 'pinBuffer']);
    expect(LAYOUT_FIELDS['2ls'].map(f => f.key)).toEqual(['pinToPap', 'pinToCog', 'psaToPap']);
  });
});

describe('completeness and formatting', () => {
  it('an empty layout is valid but not complete, and formats to blank', () => {
    const e = emptyLayout('dual_angle');
    expect(isLayoutComplete(e)).toBe(false);
    expect(formatLayout(e)).toBe('');
  });

  it('a partially-filled layout is still not complete', () => {
    let l = setLayoutValue(emptyLayout('dual_angle'), 'drillingAngle', '60');
    l = setLayoutValue(l, 'pinToPap', '4.5');
    expect(isLayoutComplete(l)).toBe(false);
  });

  it('formats a complete Dual Angle layout with correct units', () => {
    let l = setLayoutValue(emptyLayout('dual_angle'), 'drillingAngle', '60');
    l = setLayoutValue(l, 'pinToPap', '4.5');
    l = setLayoutValue(l, 'valAngle', '35');
    expect(isLayoutComplete(l)).toBe(true);
    expect(formatLayout(l)).toBe('60° x 4.5" x 35°');
  });

  it('formats VLS in inches across all three numbers', () => {
    let v = emptyLayout('vls');
    v = setLayoutValue(v, 'pinToPap', '4');
    v = setLayoutValue(v, 'psaToPap', '4');
    v = setLayoutValue(v, 'pinBuffer', '2');
    expect(formatLayout(v)).toBe('4" x 4" x 2"');
  });
});

describe('validation', () => {
  it('flags values outside a field\'s real-world range', () => {
    const high = setLayoutValue(emptyLayout('dual_angle'), 'drillingAngle', '200');
    expect(layoutFieldErrors(high).drillingAngle).toBe('Max 90°');
    const low = setLayoutValue(emptyLayout('dual_angle'), 'drillingAngle', '2');
    expect(layoutFieldErrors(low).drillingAngle).toBe('Min 10°');
  });

  it('flags non-numeric input', () => {
    const bad = setLayoutValue(emptyLayout('dual_angle'), 'pinToPap', 'abc');
    expect(layoutFieldErrors(bad).pinToPap).toBe('Not a number');
  });

  it('does not treat a blank field as an error', () => {
    // Recording a layout is optional; blank is a normal state, not a mistake.
    expect(layoutFieldErrors(emptyLayout('dual_angle'))).toEqual({});
  });
});

describe('switching systems', () => {
  it('clears the values rather than carrying them across', () => {
    let l = setLayoutValue(emptyLayout('dual_angle'), 'drillingAngle', '60');
    const switched = setLayoutSystem(l, 'vls');
    // 60 means "degrees of drilling angle" in Dual Angle but nothing
    // comparable in VLS -- keeping it would misrepresent the drilling.
    expect(switched.system).toBe('vls');
    expect(switched.values).toEqual({ pinToPap: '', psaToPap: '', pinBuffer: '' });
  });
});

describe('normalizeLayout robustness', () => {
  it('returns null for missing or unrecognized-system data', () => {
    expect(normalizeLayout(null)).toBeNull();
    expect(normalizeLayout({ system: 'not-a-system', values: {} })).toBeNull();
  });

  it('fills in absent fields as blank rather than undefined', () => {
    expect(normalizeLayout({ system: 'vls' }).values).toEqual({ pinToPap: '', psaToPap: '', pinBuffer: '' });
  });

  it('coerces stored numbers to strings so inputs stay controlled', () => {
    expect(normalizeLayout({ system: 'vls', values: { pinToPap: 4 } }).values.pinToPap).toBe('4');
  });
});
