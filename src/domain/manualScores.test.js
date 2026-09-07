import { describe, it, expect } from 'vitest';
import {
  getGameEquipment, setGameEquipment, defaultPracticeBall,
} from './manualScores.js';

// A games-only practice still has a ball and a surface -- that's what
// practice is for. Stored on the same row as the score so they can't drift.
describe('per-game equipment', () => {
  it('merges patches rather than replacing', () => {
    let e = setGameEquipment({}, 'R', 'Practice', '2026-09-01', 1, { ball: 'Bionic' });
    e = setGameEquipment(e, 'R', 'Practice', '2026-09-01', 1, { surface: '2000' });
    expect(getGameEquipment(e, 'R', 'Practice', '2026-09-01', 1)).toEqual({ ball: 'Bionic', surface: '2000' });
  });

  it('keeps games separate', () => {
    const e = setGameEquipment({}, 'R', 'Practice', '2026-09-01', 1, { ball: 'Bionic' });
    expect(getGameEquipment(e, 'R', 'Practice', '2026-09-01', 2).ball).toBe('');
  });

  it('removes the entry when everything is cleared', () => {
    let e = setGameEquipment({}, 'R', 'Practice', '2026-09-01', 1, { ball: 'Bionic' });
    e = setGameEquipment(e, 'R', 'Practice', '2026-09-01', 1, { ball: '' });
    expect(Object.keys(e)).toHaveLength(0);
  });
});

describe('default practice ball', () => {
  // One real ball means no choice to make.
  it('pre-fills when there is exactly one real ball', () => {
    expect(defaultPracticeBall(['Bionic'])).toBe('Bionic');
    expect(defaultPracticeBall(['Bionic', 'Plastic'])).toBe('Bionic');
  });

  // Nobody practises strikes with a plastic, so it never defaults.
  it('never defaults to plastic, and asks when there is a real choice', () => {
    expect(defaultPracticeBall(['Plastic'])).toBe('');
    expect(defaultPracticeBall(['Bionic', 'Phaze II'])).toBe('');
  });
});
