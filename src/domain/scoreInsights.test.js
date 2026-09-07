import { describe, it, expect } from 'vitest';
import {
  gamePositionAverages, positionFade, consistency, formVsBook, scoreStats, SCORE_THRESHOLDS,
} from './scoreInsights.js';

const fading = Array.from({ length: 10 }, (_, i) => ({ bowler: 'R', scores: [200 + i % 5, 195 + i % 5, 168 + i % 5] }));

describe('game position', () => {
  it('averages each slot in the series separately', () => {
    const p = gamePositionAverages(fading, 'R');
    expect(p.map(x => x.position)).toEqual([1, 2, 3]);
    expect(p[0].average).toBeGreaterThan(p[2].average);
  });

  // A four-game set has four positions; blending the fourth into the
  // first would hide the exact fade this exists to find.
  it('keeps a four-game set as four positions', () => {
    expect(gamePositionAverages([{ bowler: 'R', scores: [200, 190, 180, 170] }], 'R')).toHaveLength(4);
  });

  it('measures the drop from the best slot to the last', () => {
    expect(positionFade(fading, 'R').fade).toBe(32);
  });

  it('returns nothing for a single game', () => {
    expect(positionFade([{ bowler: 'R', scores: [200] }], 'R')).toBeNull();
  });
});

describe('consistency', () => {
  // Same average, completely different bowler.
  it('separates within-night swing from night-to-night swing', () => {
    const steady = consistency([{ bowler: 'R', scores: [180, 180, 180] }, { bowler: 'R', scores: [180, 180, 180] }], 'R');
    const erratic = consistency([{ bowler: 'R', scores: [140, 230, 170] }, { bowler: 'R', scores: [140, 230, 170] }], 'R');
    expect(steady.withinNight).toBe(0);
    expect(erratic.withinNight).toBeGreaterThan(30);
  });
});

describe('form vs book', () => {
  it('compares recent games with the frozen book average', () => {
    expect(formVsBook(fading, 'R', 190).diff).toBe(0);
  });

  // No book average means no comparison -- not a diff against zero.
  it('returns nothing without a book average', () => {
    expect(formVsBook(fading, 'R', '')).toBeNull();
    expect(formVsBook(fading, 'R', 0)).toBeNull();
  });
});

describe('scoreStats', () => {
  it('carries sample sizes so the gating layer can withhold', () => {
    const s = scoreStats(fading, 'R', 190);
    expect(s.nights).toBe(10);
    expect(s.gamePosition.sampleSize).toBe(10);
  });

  it('thresholds count nights, not shots', () => {
    expect(SCORE_THRESHOLDS.gamePosition).toBe(8);
    expect(SCORE_THRESHOLDS.consistency).toBe(6);
  });
});
