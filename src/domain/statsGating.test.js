import { describe, it, expect } from 'vitest';
import {
  cardNeeds, cardHasData, visibleStatsCards, lockedStatsMessage, lockedStatsDetail,
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

describe('lockedStatsDetail', () => {
  const ids = ['seasonRecord', 'splits', 'cleanFrames', 'byBall'];
  const labels = { splits: 'Splits', cleanFrames: 'Clean Frames', byBall: 'By Ball' };
  const labelFor = id => labels[id] || id;

  it('names the locked stats, grouped by what unlocks them', () => {
    const d = lockedStatsDetail(ids, { shotCount: 0, ballCount: 0 }, labelFor);
    expect(d.shots).toEqual(['Clean Frames', 'Splits']);
    expect(d.balls).toEqual(['By Ball']);
  });

  it('lists nothing for a group that is already unlocked', () => {
    const d = lockedStatsDetail(ids, { shotCount: 36, ballCount: 0 }, labelFor);
    expect(d.shots).toEqual([]);
    expect(d.balls).toEqual(['By Ball']);
  });

  // A stat that works from scores alone is never "locked" -- listing it
  // would suggest tracking more would reveal something that is already
  // on screen.
  it('never lists a score-based card', () => {
    const d = lockedStatsDetail(ids, { shotCount: 0, ballCount: 0 }, labelFor);
    expect([...d.shots, ...d.balls]).not.toContain('seasonRecord');
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(() => lockedStatsDetail(junk, junk, junk)).not.toThrow();
    }
    expect(lockedStatsDetail(null, null, null)).toEqual({ shots: [], balls: [] });
  });
});

describe('lockedStatsMessage', () => {
  const ids = ['seasonRecord', 'splits', 'cleanFrames', 'byBall'];

  it('names frame tracking when only frame cards are hidden', () => {
    const msg = lockedStatsMessage(ids, { shotCount: 0, ballCount: 5 });
    expect(msg).toContain('frame tracking');
    expect(msg).toContain('2');
  });

  it('names ball logging when only ball cards are hidden', () => {
    const msg = lockedStatsMessage(ids, { shotCount: 36, ballCount: 0 });
    expect(msg).toContain('ball');
    expect(msg).not.toContain('frame tracking');
  });

  it('mentions both when both are missing', () => {
    const msg = lockedStatsMessage(ids, { shotCount: 0, ballCount: 0 });
    expect(msg).toContain('frame tracking');
    expect(msg).toContain('ball');
  });

  // Nothing to say when nothing is hidden -- a message that always
  // appears is a nag, and this one asks for real extra effort at the
  // lanes.
  it('says nothing when everything is showing', () => {
    expect(lockedStatsMessage(ids, { shotCount: 36, ballCount: 3 })).toBe(null);
    expect(lockedStatsMessage(['seasonRecord'], { shotCount: 0 })).toBe(null);
  });

  it('agrees the verb with the count, not just the noun', () => {
    expect(lockedStatsMessage(['byBall'], { ballCount: 0 })).toContain('1 stat unlocks');
    expect(lockedStatsMessage(['splits', 'cleanFrames'], { shotCount: 0 })).toContain('2 stats unlock ');
  });

  // The two are INDEPENDENT choices. Joining them with "and" implied
  // both were needed for all of them -- you can note which ball bowled a
  // game without tracking a single frame, which is what the per-game
  // ball dropdown is for.
  it('states the two counts separately', () => {
    const msg = lockedStatsMessage(['splits', 'cleanFrames', 'byBall'], { shotCount: 0, ballCount: 0 });
    expect(msg).toContain('2 stats unlock if you use frame tracking');
    expect(msg).toContain('1 stat unlocks if you note which ball');
    expect(msg).toContain('Either on its own is fine');
  });

  // Tacked onto a single option it reads as an apology for a choice
  // nobody was offered.
  it('drops the "either" line when there is only one option', () => {
    expect(lockedStatsMessage(['byBall'], { shotCount: 9, ballCount: 0 })).not.toContain('Either');
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(() => lockedStatsMessage(junk, junk)).not.toThrow();
    }
    expect(lockedStatsMessage(null, null)).toBe(null);
  });
});
