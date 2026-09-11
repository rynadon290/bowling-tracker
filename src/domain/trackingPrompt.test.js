import { describe, it, expect } from 'vitest';
import {
  isScoresOnlyNight, scoresOnlyNightCount, shouldOfferShotByShot, NIGHTS_BEFORE_OFFER,
} from './trackingPrompt.js';

const night = (bowler, shotCount) => ({ bowler, shotCount, date: '2026-09-01' });
const threeNights = (bowler = 'Ryan') => [night(bowler), night(bowler), night(bowler)];

describe('isScoresOnlyNight', () => {
  it('counts a night with no shots', () => {
    expect(isScoresOnlyNight({ shotCount: 0 })).toBe(true);
  });

  // A session object that predates the field, or arrives without it, is
  // the same situation. A strict shotCount === 0 check would skip it.
  it('counts a night with the field missing entirely', () => {
    expect(isScoresOnlyNight({ bowler: 'Ryan' })).toBe(true);
  });

  it('does not count a night with per-ball detail', () => {
    expect(isScoresOnlyNight({ shotCount: 36 })).toBe(false);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, [], true]) {
      expect(() => isScoresOnlyNight(junk)).not.toThrow();
      expect(isScoresOnlyNight(junk)).toBe(false);
    }
  });
});

describe('scoresOnlyNightCount', () => {
  // The one that matters: a captain logging four teammates has four
  // sessions per night. Counting all of them fires the prompt after a
  // single evening, which is exactly the "pitched at setup" failure this
  // is meant to avoid.
  it('counts only this bowler\'s nights, not the whole team\'s', () => {
    const sessions = [
      night('Ryan'), night('Maggie'), night('Dave'), night('Sam'),
    ];
    expect(scoresOnlyNightCount(sessions, 'Ryan')).toBe(1);
  });

  it('ignores nights that already have shot detail', () => {
    const sessions = [night('Ryan'), night('Ryan', 36), night('Ryan')];
    expect(scoresOnlyNightCount(sessions, 'Ryan')).toBe(2);
  });

  it('returns 0 for junk rather than throwing', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(scoresOnlyNightCount(junk, 'Ryan')).toBe(0);
    }
    expect(scoresOnlyNightCount([night('Ryan')], null)).toBe(0);
  });
});

describe('shouldOfferShotByShot', () => {
  const base = { sessions: threeNights(), bowler: 'Ryan', trackingMode: 'game', environment: 'league', dismissed: false };

  it('offers after three scores-only nights', () => {
    expect(shouldOfferShotByShot(base)).toBe(true);
  });

  it('stays quiet before then', () => {
    expect(shouldOfferShotByShot({ ...base, sessions: [night('Ryan'), night('Ryan')] })).toBe(false);
    expect(NIGHTS_BEFORE_OFFER).toBe(3);
  });

  it('never asks again once dismissed', () => {
    expect(shouldOfferShotByShot({ ...base, dismissed: true })).toBe(false);
    // Still false with far more nights -- dismissed is forever, not a snooze.
    expect(shouldOfferShotByShot({
      ...base, dismissed: true, sessions: Array.from({ length: 40 }, () => night('Ryan')),
    })).toBe(false);
  });

  it('has nothing to offer someone already tracking shot by shot', () => {
    expect(shouldOfferShotByShot({ ...base, trackingMode: 'shot' })).toBe(false);
  });

  // Finding 4: casual mode is the strongest part of the app precisely
  // because it asks nothing of you. A prompt to track more detail is the
  // one thing guaranteed to spoil it.
  it('never interrupts casual mode', () => {
    expect(shouldOfferShotByShot({ ...base, environment: 'casual' })).toBe(false);
  });

  it('survives junk input', () => {
    for (const junk of [null, undefined, 'x', 42, [], {}]) {
      expect(() => shouldOfferShotByShot(junk)).not.toThrow();
      expect(shouldOfferShotByShot(junk)).toBe(false);
    }
  });
});
