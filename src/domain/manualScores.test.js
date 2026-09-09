import { describe, it, expect } from 'vitest';
import {
  getGameEquipment, setGameEquipment, defaultPracticeBall,
  setManualScore,
  resolveGameScore,
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

// Importing frame data over an existing game score.
//
// Manual scores win over shot-derived ones everywhere in the app, which
// is right -- a typed score is a deliberate override. But it means that
// importing frames for a game that already has a manual score would
// store the frames and then keep displaying the old number, with the two
// silently disagreeing.
//
// ImportScorecard clears the manual score for any game that arrives WITH
// frames, which is what makes the import actually take effect. This pins
// that behaviour, since the bug it prevents is invisible.
describe('shot data imported over an existing game score', () => {
  const who = ['Ryan', 'Tuesday House Shot', '2026-09-03', 1];

  it('shows the manual score while one is set', () => {
    const ms = setManualScore({}, ...who, '185');
    expect(resolveGameScore(ms, ...who, 212)).toBe(185);
  });

  it('falls back to the shot-derived score once the manual one is cleared', () => {
    let ms = setManualScore({}, ...who, '185');
    ms = setManualScore(ms, ...who, '');
    expect(resolveGameScore(ms, ...who, 212)).toBe(212);
  });

  // The reverse is intentional: a scores-only import for a game that
  // already has frames sets a manual score, and that override wins.
  // ImportScorecard warns before doing it.
  it('lets a deliberate manual score override existing frames', () => {
    const ms = setManualScore({}, ...who, '190');
    expect(resolveGameScore(ms, ...who, 212)).toBe(190);
  });
});
