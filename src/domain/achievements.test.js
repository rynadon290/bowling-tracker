import { describe, it, expect } from 'vitest';
import {
  honorScores, personalBests, achievementsFor,
  placementAchievement, achievementHeadline, PLACEMENTS,
} from './achievements.js';

// "Your average went up 3 pins" is not something anyone shares. These
// are the moments people actually want to.
describe('honorScores', () => {
  it('recognises a perfect game', () => {
    expect(honorScores([300, 190, 205])[0].id).toBe('perfect-game');
  });

  it('recognises an 800 series', () => {
    const r = honorScores([268, 279, 258]);
    expect(r.some(a => a.id === 'honor-series')).toBe(true);
  });

  // 299 and 798 are superb and are NOT honor scores. Calling one an
  // honor score would be wrong in front of people who know.
  it('does not award 299 or 798', () => {
    expect(honorScores([299, 200, 200])).toEqual([]);
    expect(honorScores([266, 266, 266])).toEqual([]);
  });

  it('awards both when a 300 is part of an 800', () => {
    const r = honorScores([300, 268, 258]);
    expect(r.map(a => a.id).sort()).toEqual(['honor-series', 'perfect-game']);
  });

  it('handles an unfinished night', () => {
    expect(honorScores([210, null, null])).toEqual([]);
  });
});

describe('personalBests', () => {
  const prev = { highGame: 232, highSeries: 640 };

  it('awards beating your best game', () => {
    const r = personalBests([245, 190, 200], null, prev);
    expect(r[0].id).toBe('high-game');
    expect(r[0].detail).toContain('232');
  });

  it('awards beating your best series', () => {
    const r = personalBests([230, 220, 215], null, prev);
    expect(r.some(a => a.id === 'high-series')).toBe(true);
  });

  it('does not award matching your best', () => {
    expect(personalBests([232, 100, 100], null, prev).some(a => a.id === 'high-game')).toBe(false);
  });

  // Everyone's first night would trigger one, and the moment would mean
  // nothing. That's why the profile asks for an all-time best.
  it('awards nothing when there is no previous best on record', () => {
    expect(personalBests([245, 190, 200], null, {})).toEqual([]);
  });
});

describe('placement', () => {
  it('awards a win', () => {
    const a = placementAchievement('won', 'Spring Open');
    expect(a.title).toBe('Won it');
    expect(a.detail).toContain('Spring Open');
  });

  // Not cashing is a real answer, not an achievement.
  it('awards nothing for not cashing', () => {
    expect(placementAchievement('none', 'Spring Open')).toBeNull();
    expect(placementAchievement(null)).toBeNull();
  });

  it('offers every placement a label and id', () => {
    for (const p of PLACEMENTS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
    }
  });
});

describe('achievementsFor', () => {
  // The order a bowler would tell someone about them in.
  it('leads with the honor score', () => {
    const r = achievementsFor({
      games: [300, 190, 200], previous: { highGame: 232 },
      placementId: 'won', tournamentName: 'Spring Open',
    });
    expect(r[0].id).toBe('perfect-game');
    expect(r.map(a => a.id)).toContain('placement-won');
    expect(r.map(a => a.id)).toContain('high-game');
  });

  it('returns nothing on an ordinary night', () => {
    expect(achievementsFor({ games: [190, 185, 200], previous: { highGame: 232, highSeries: 640 } })).toEqual([]);
  });

  it('makes a headline for a share card', () => {
    expect(achievementHeadline(achievementsFor({ games: [300, 190, 200] }))).toContain('Perfect game');
    expect(achievementHeadline([])).toBe('');
  });
});

// Bad input shouldn't crash a domain function.
//
// achievementsFor({games: null}) threw. No call site passes that today
// -- they all guard with (scores || []) -- but a domain function that
// depends on every future caller remembering a guard is a crash waiting
// for the next screen that uses it. A session with no scores logged yet
// is a completely ordinary state.
describe('bad input', () => {
  const junk = [null, undefined, '', 5, {}, [], NaN, true];

  it('never throws, whatever it is handed', () => {
    for (const v of junk) {
      expect(() => achievementsFor(v)).not.toThrow();
      expect(() => achievementsFor({ games: v })).not.toThrow();
      expect(() => honorScores(v)).not.toThrow();
      expect(() => personalBests(v, v, v)).not.toThrow();
      expect(() => achievementHeadline(v)).not.toThrow();
    }
  });

  it('returns nothing rather than guessing', () => {
    expect(achievementsFor({ games: null })).toEqual([]);
    expect(achievementHeadline(null)).toBe('');
  });

  // The hardening must not have loosened the rules.
  it('still gets the real cases right', () => {
    expect(achievementsFor({ games: [300] })[0].id).toBe('perfect-game');
    expect(achievementsFor({ games: [299] })).toEqual([]);
    expect(achievementsFor({ games: [267, 267, 266] })[0].id).toBe('honor-series');
  });
});
