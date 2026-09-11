import { describe, it, expect } from 'vitest';
import {
  cardNeeds, cardHasData, visibleStatsCards, lockedStatsMessage,
} from './statsGating.js';

describe('cardNeeds', () => {
  it('classifies the three kinds', () => {
    expect(cardNeeds('splits')).toBe('shots');
    expect(cardNeeds('byBall')).toBe('balls');
    expect(cardNeeds('seasonRecord')).toBe('scores');
  });

  // Failing toward visible is deliberate: a new card should show until
  // someone says otherwise, rather than vanish silently.
  it('treats an unknown card as score-based', () => {
    expect(cardNeeds('somethingAddedLater')).toBe('scores');
    expect(cardNeeds(undefined)).toBe('scores');
  });
});

describe('cardHasData', () => {
  it('hides shot cards with no shots', () => {
    expect(cardHasData('splits', { shotCount: 0 })).toBe(false);
    expect(cardHasData('splits', { shotCount: 36 })).toBe(true);
  });

  it('hides ball cards with no ball recorded', () => {
    expect(cardHasData('byBall', { shotCount: 36, ballCount: 0 })).toBe(false);
    expect(cardHasData('byBall', { ballCount: 3 })).toBe(true);
  });

  // The whole point: a scores-only night still fills the score cards.
  it('always shows score cards', () => {
    expect(cardHasData('seasonRecord', { shotCount: 0, ballCount: 0 })).toBe(true);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, []]) {
      expect(() => cardHasData('splits', junk)).not.toThrow();
    }
    expect(cardHasData('splits', {})).toBe(false);
  });
});

describe('visibleStatsCards', () => {
  const ids = ['seasonRecord', 'splits', 'byBall', 'gameByGame'];

  it('keeps only what can populate', () => {
    expect(visibleStatsCards(ids, { shotCount: 0, ballCount: 0 }))
      .toEqual(['seasonRecord', 'gameByGame']);
  });

  it('opens up as data arrives', () => {
    expect(visibleStatsCards(ids, { shotCount: 36, ballCount: 0 }))
      .toEqual(['seasonRecord', 'splits', 'gameByGame']);
    expect(visibleStatsCards(ids, { shotCount: 36, ballCount: 3 })).toEqual(ids);
  });

  it('preserves the order it was given', () => {
    const out = visibleStatsCards(['gameByGame', 'seasonRecord'], { shotCount: 0 });
    expect(out).toEqual(['gameByGame', 'seasonRecord']);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(visibleStatsCards(junk, {})).toEqual([]);
    }
  });
});

describe('lockedStatsMessage', () => {
  const ids = ['seasonRecord', 'splits', 'cleanFrames', 'byBall'];

  it('names shot tracking when only shot cards are hidden', () => {
    const msg = lockedStatsMessage(ids, { shotCount: 0, ballCount: 5 });
    expect(msg).toContain('shot by shot');
    expect(msg).toContain('2');
  });

  it('names ball logging when only ball cards are hidden', () => {
    const msg = lockedStatsMessage(ids, { shotCount: 36, ballCount: 0 });
    expect(msg).toContain('ball');
    expect(msg).not.toContain('shot by shot');
  });

  it('mentions both when both are missing', () => {
    const msg = lockedStatsMessage(ids, { shotCount: 0, ballCount: 0 });
    expect(msg).toContain('shot by shot');
    expect(msg).toContain('ball');
  });

  // Nothing to say when nothing is hidden -- a message that always
  // appears is a nag, and this one asks for real extra effort at the
  // lanes.
  it('says nothing when everything is showing', () => {
    expect(lockedStatsMessage(ids, { shotCount: 36, ballCount: 3 })).toBe(null);
    expect(lockedStatsMessage(['seasonRecord'], { shotCount: 0 })).toBe(null);
  });

  it('gets the singular right', () => {
    expect(lockedStatsMessage(['byBall'], { ballCount: 0 })).toContain('1 more stat ');
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(() => lockedStatsMessage(junk, junk)).not.toThrow();
    }
    expect(lockedStatsMessage(null, null)).toBe(null);
  });
});
