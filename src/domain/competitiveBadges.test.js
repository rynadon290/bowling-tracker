import { describe, it, expect } from 'vitest';
import {
  COMPETITIVE_BADGES, REPEATABLE, canEarnIn, badgesForMode, whereEarnable,
  LEAGUE, TOURNAMENT, PRACTICE,
} from './competitiveBadges.js';
import { CASUAL_BADGES } from './casualBadges.js';

describe('the badge set itself', () => {
  it('has no duplicate ids', () => {
    const ids = COMPETITIVE_BADGES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Two badges sharing an icon in one grid is the collision that started
  // this -- 🎯 was on three badges at once.
  it('has no duplicate icons', () => {
    const icons = COMPETITIVE_BADGES.map(b => b.emoji);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('gives every badge at least one mode it can be earned in', () => {
    for (const b of COMPETITIVE_BADGES) {
      expect(Array.isArray(b.modes) && b.modes.length).toBeTruthy();
    }
  });

  it('gives every badge a name and a blurb', () => {
    for (const b of COMPETITIVE_BADGES) {
      expect(b.name).toBeTruthy();
      expect(b.blurb).toBeTruthy();
    }
  });

  // Casual is a separate pool by design. A shared id would make the two
  // collections collide if they were ever rendered from one list.
  // A shared ICON is fine -- the two pools never render in one grid, so a
  // casual and a league badge can both be a bowling ball. A shared ID is
  // not: it would collide the moment anything keys both sets from one map.
  it('shares no ids with the casual set', () => {
    const casual = new Set(CASUAL_BADGES.map(b => b.id));
    for (const b of COMPETITIVE_BADGES) expect(casual.has(b.id)).toBe(false);
  });

  it('only marks badges repeatable that actually exist', () => {
    const ids = new Set(COMPETITIVE_BADGES.map(b => b.id));
    for (const id of REPEATABLE) expect(ids.has(id)).toBe(true);
  });
});

describe('practice is drills only', () => {
  const practice = badgesForMode(PRACTICE).map(b => b.id);

  it('earns exactly the seven drill badges', () => {
    expect(practice.sort()).toEqual([
      'century', 'first-drill', 'graduated', 'midnight-oil',
      'repeat-customer', 'trending-up', 'two-sided',
    ]);
  });

  // Stated outright: bowlers don't count practice honor scores, and a
  // badge claiming otherwise would be wrong in front of people who know.
  it('cannot earn 300 or 800', () => {
    expect(canEarnIn('perfect-game', PRACTICE)).toBe(false);
    expect(canEarnIn('eight-hundred', PRACTICE)).toBe(false);
  });

  // A rising score across three games means something under pressure.
  // In practice it might just mean you started cold on purpose.
  it('cannot earn the competition-pressure badges', () => {
    expect(canEarnIn('ramping-up', PRACTICE)).toBe(false);
    expect(canEarnIn('strong-finish', PRACTICE)).toBe(false);
  });

  it('cannot earn anything needing a team', () => {
    for (const id of ['carried-it', 'held-the-line', 'team-high-game', 'executioner']) {
      expect(canEarnIn(id, PRACTICE)).toBe(false);
    }
  });
});

describe('league and tournament', () => {
  it('both earn the honor scores', () => {
    for (const mode of [LEAGUE, TOURNAMENT]) {
      expect(canEarnIn('perfect-game', mode)).toBe(true);
      expect(canEarnIn('eight-hundred', mode)).toBe(true);
    }
  });

  it('keeps team badges to league — a tournament has no team sheet', () => {
    expect(canEarnIn('carried-it', LEAGUE)).toBe(true);
    expect(canEarnIn('carried-it', TOURNAMENT)).toBe(false);
  });

  it('keeps cut and placement badges to tournament', () => {
    expect(canEarnIn('made-the-cut', TOURNAMENT)).toBe(true);
    expect(canEarnIn('made-the-cut', LEAGUE)).toBe(false);
  });

  it('never lets a drill badge be earned outside practice', () => {
    for (const id of ['first-drill', 'century', 'graduated']) {
      expect(canEarnIn(id, LEAGUE)).toBe(false);
      expect(canEarnIn(id, TOURNAMENT)).toBe(false);
    }
  });
});

describe('whereEarnable', () => {
  it('names one mode plainly', () => {
    expect(whereEarnable('first-drill')).toBe('Earned in practice only');
  });

  it('names two modes as a choice', () => {
    expect(whereEarnable('perfect-game')).toBe('Earned in league or tournament');
  });

  it('says nothing for a badge it does not know', () => {
    expect(whereEarnable('not-a-badge')).toBe('');
  });
});

describe('survives junk', () => {
  it('canEarnIn and whereEarnable do not throw', () => {
    for (const junk of [null, undefined, 42, {}, [], '']) {
      expect(() => canEarnIn(junk, junk)).not.toThrow();
      expect(() => whereEarnable(junk)).not.toThrow();
      expect(() => badgesForMode(junk)).not.toThrow();
    }
    expect(canEarnIn(null, null)).toBe(false);
    expect(badgesForMode(null)).toEqual([]);
  });
});
