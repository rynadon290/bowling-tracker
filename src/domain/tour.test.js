import { describe, it, expect } from 'vitest';
import { tourSteps, tourLength, stepAt, isLastStep } from './tour.js';

// The walkthrough a new bowler gets after setup. Setup asks the two
// things the app can't work without; it can't explain what five tabs are
// for, which is what left a new bowler poking at a full app.
describe('tourSteps', () => {
  const league = { trackingMode: 'shot', showMoneyGames: true };
  const casual = { trackingMode: 'game', showMoneyGames: false };

  // Every tab a step names must be a REAL nav id.
  //
  // The Stats step said "stats"; the nav's internal id is "data". An
  // unknown view hits BowlingTracker's guard and bounces to Bowl, so the
  // tour jumped to the Bowl tab while its text described Stats. Nothing
  // errored -- it just quietly went to the wrong place.
  it('only names tabs that actually exist in the nav', () => {
    const NAV_IDS = ['log', 'history', 'data', 'insights', 'locker'];
    for (const step of tourSteps({ trackingMode: 'shot', showMoneyGames: true })) {
      if (step.tab) expect(NAV_IDS).toContain(step.tab);
    }
  });

  it('covers every tab', () => {
    const tabs = tourSteps(league).map(s => s.tab).filter(Boolean);
    for (const tab of ['log', 'history', 'data', 'insights', 'locker']) {
      expect(tabs).toContain(tab);
    }
  });

  it('starts on Bowl, which is where a new bowler lands', () => {
    expect(tourSteps(league)[0].id).toBe('bowl');
  });

  // Promising a scoresheet to someone tracking by game score would be a
  // lie -- they never see one.
  it('skips the scoresheet when not tracking shot by shot', () => {
    expect(tourSteps(league).map(s => s.id)).toContain('scoresheet');
    expect(tourSteps(casual).map(s => s.id)).not.toContain('scoresheet');
  });

  it('skips money games when they are turned off', () => {
    expect(tourSteps(league).map(s => s.id)).toContain('money');
    expect(tourSteps(casual).map(s => s.id)).not.toContain('money');
  });

  it('is shorter for a casual bowler than a league bowler', () => {
    expect(tourLength(casual)).toBeLessThan(tourLength(league));
  });

  it('gives every step a title and body', () => {
    for (const s of tourSteps(league)) {
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
    }
  });

  it('works with no preferences at all', () => {
    expect(tourSteps({}).length).toBeGreaterThan(0);
    expect(tourSteps(undefined).length).toBeGreaterThan(0);
  });
});

describe('stepAt', () => {
  const prefs = { trackingMode: 'shot', showMoneyGames: true };

  // Clamped, not wrapped: running off the end should stop, not silently
  // send a new bowler back to step one.
  it('clamps rather than wrapping', () => {
    expect(stepAt(prefs, -5).id).toBe('bowl');
    expect(stepAt(prefs, 999).id).toBe('money');
  });

  it('knows when it is on the last step', () => {
    expect(isLastStep(prefs, tourLength(prefs) - 1)).toBe(true);
    expect(isLastStep(prefs, 0)).toBe(false);
  });

  it('reports the last step for an over-large index', () => {
    expect(isLastStep(prefs, 999)).toBe(true);
  });
});
