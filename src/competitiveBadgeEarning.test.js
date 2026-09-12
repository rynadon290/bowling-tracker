import { describe, it, expect } from 'vitest';
import {
  badgesFromLeagueNight, badgesFromTournamentDay, badgesFromPracticeSession,
  seasonBadges, competitiveBadgeHistory,
} from './competitiveBadgeEarning.js';

const ctx = {
  average: 190, bookAverage: 190,
  previousHighGame: 279, previousHighSeries: 650,
};

describe('league nights', () => {
  it('awards a perfect game', () => {
    expect(badgesFromLeagueNight({ scores: [300, 190, 180] }, ctx)).toContain('perfect-game');
  });

  it('awards an 800 series for a three-game set', () => {
    expect(badgesFromLeagueNight({ scores: [270, 270, 270] }, ctx)).toContain('eight-hundred');
  });

  // An 800 is a THREE-GAME series specifically. This summed however many
  // games were logged, so a longer set adding to 800 claimed an honor
  // score that never happened.
  it('does not award an 800 for a longer set that happens to total 800', () => {
    expect(badgesFromLeagueNight({ scores: [160, 160, 160, 160, 160] }, ctx))
      .not.toContain('eight-hundred');
  });

  // A 300 is a 300 whatever the format.
  it('awards a 300 regardless of how many games were bowled', () => {
    expect(badgesFromLeagueNight({ scores: [300] }, ctx)).toContain('perfect-game');
    expect(badgesFromLeagueNight({ scores: [180, 300, 190, 210, 200] }, ctx)).toContain('perfect-game');
  });

  // 299 and 798 are superb and are NOT honor scores. Calling them one
  // would be wrong in front of people who know the difference.
  it('does not award an honor score for 299 or 798', () => {
    const got = badgesFromLeagueNight({ scores: [299, 250, 249] }, ctx);
    expect(got).not.toContain('perfect-game');
    expect(got).not.toContain('eight-hundred');
  });

  it('scales to the bowler rather than a flat number', () => {
    // 205 is a fine game and no badge for a 190 average.
    const modest = badgesFromLeagueNight({ scores: [205, 190, 185] }, ctx);
    expect(modest).not.toContain('book-buster');
    // 40 over the book is.
    expect(badgesFromLeagueNight({ scores: [231, 190, 185] }, ctx)).toContain('book-buster');
  });

  it('needs three STRAIGHT games above average for a heater', () => {
    expect(badgesFromLeagueNight({ scores: [200, 180, 200, 200] }, ctx)).not.toContain('heater');
    expect(badgesFromLeagueNight({ scores: [200, 200, 200] }, ctx)).toContain('heater');
  });

  it('awards in the pocket only when every game is within 5 pins', () => {
    expect(badgesFromLeagueNight({ scores: [188, 192, 190] }, ctx)).toContain('in-the-pocket');
    expect(badgesFromLeagueNight({ scores: [188, 210, 190] }, ctx)).not.toContain('in-the-pocket');
  });

  it('awards clean only when every frame is a strike or a spare', () => {
    const strike = f => ({ frame: f, result: 'Strike' });
    const spare = f => ({ frame: f, result: 'Other Leave', spareMade: 'Yes' });
    const open = f => ({ frame: f, result: 'Other Leave', spareMade: 'No' });
    const allClean = Array.from({ length: 10 }, (_, i) => i % 2 ? strike(i + 1) : spare(i + 1));
    expect(badgesFromLeagueNight({ scores: [200], shots: allClean }, ctx)).toContain('clean');
    expect(badgesFromLeagueNight({ scores: [200], shots: [...allClean.slice(1), open(1)] }, ctx))
      .not.toContain('clean');
  });

  it('gives nothing for a night with no scores', () => {
    expect(badgesFromLeagueNight({ scores: [] }, ctx)).toEqual([]);
  });
});

// A bowler's very first night has nothing to beat.
//
// Number(null) is 0 and 0 is finite, so a num() helper built the obvious
// way returned 0 for "no previous high" -- and the first night then beat
// a high game of 0, cleared an average of 0, and awarded New high game,
// New high series and Heater to someone who had never bowled before.
describe('a first night with no history', () => {
  const noHistory = {
    average: null, bookAverage: null,
    previousHighGame: null, previousHighSeries: null,
  };

  it('awards no personal-best badge', () => {
    const got = badgesFromLeagueNight({ scores: [180, 190, 200] }, noHistory);
    expect(got).not.toContain('new-high-game');
    expect(got).not.toContain('new-high-series');
  });

  it('awards no average-relative badge', () => {
    const got = badgesFromLeagueNight({ scores: [200, 200, 200] }, noHistory);
    expect(got).not.toContain('heater');
    expect(got).not.toContain('in-the-pocket');
    expect(got).not.toContain('cold-start-warm-finish');
    expect(got).not.toContain('book-buster');
  });

  // An honor score needs no history to be real.
  it('still awards a 300', () => {
    expect(badgesFromLeagueNight({ scores: [300, 180, 180] }, noHistory)).toContain('perfect-game');
  });
});

describe('practice earns drill badges and nothing else', () => {
  // The evaluator never looks at a score, which is what makes the rule
  // structural rather than a filter someone can forget to apply.
  it('cannot award an honor score even if the session had one', () => {
    const got = badgesFromPracticeSession([{ target: '10pin', made: 12, missed: 0 }], {});
    expect(got).not.toContain('perfect-game');
    expect(got).not.toContain('eight-hundred');
  });

  it('cannot award competition-pressure badges', () => {
    const got = badgesFromPracticeSession([{ target: '10pin', made: 9, missed: 1 }], {});
    expect(got).not.toContain('ramping-up');
    expect(got).not.toContain('strong-finish');
  });

  it('awards first drill and two-sided', () => {
    const got = badgesFromPracticeSession(
      [{ target: '10pin', made: 5, missed: 5 }, { target: '7pin', made: 4, missed: 6 }], {});
    expect(got).toContain('first-drill');
    expect(got).toContain('two-sided');
  });

  it('needs 20+ attempts before graduating, not just a high rate', () => {
    const drills = [{ target: '10pin', made: 4, missed: 1 }];
    expect(badgesFromPracticeSession(drills, { targetConversion: 0.9, lifetimeAttemptsOnTarget: 5 }))
      .not.toContain('graduated');
    expect(badgesFromPracticeSession(drills, { targetConversion: 0.9, lifetimeAttemptsOnTarget: 40 }))
      .toContain('graduated');
  });

  it('gives nothing for an empty session', () => {
    expect(badgesFromPracticeSession([], {})).toEqual([]);
  });
});

describe('tournament days', () => {
  it('needs every step to rise for ramping up', () => {
    expect(badgesFromTournamentDay({ scores: [180, 190, 205] }, {})).toContain('ramping-up');
    // Three flat games and one big one is Strong finish, not a ramp.
    expect(badgesFromTournamentDay({ scores: [180, 180, 180, 260] }, {})).not.toContain('ramping-up');
  });

  it('excludes the last game from the strong-finish baseline', () => {
    // 180,180,180 average 180; a 240 finish is +60.
    expect(badgesFromTournamentDay({ scores: [180, 180, 180, 240] }, {})).toContain('strong-finish');
    expect(badgesFromTournamentDay({ scores: [180, 180, 180, 210] }, {})).not.toContain('strong-finish');
  });

  it('awards squeaked in only alongside making the cut', () => {
    expect(badgesFromTournamentDay({ scores: [200] }, { madeCut: true, cutMargin: 4 }))
      .toContain('squeaked-in');
    expect(badgesFromTournamentDay({ scores: [200] }, { madeCut: false, cutMargin: 4 }))
      .not.toContain('squeaked-in');
  });

  it('awards top five for a win as well as a placing', () => {
    const won = badgesFromTournamentDay({ scores: [200] }, { placement: 1 });
    expect(won).toContain('won-it');
    expect(won).toContain('top-five');
  });

  it('never awards a team badge — a tournament has no team sheet', () => {
    const got = badgesFromTournamentDay({ scores: [250, 250, 250] }, { placement: 1 });
    for (const id of ['carried-it', 'team-high-game', 'executioner']) expect(got).not.toContain(id);
  });
});

describe('season badges', () => {
  it('needs three seasons for old guard', () => {
    expect(seasonBadges({ seasonsCompleted: 2 })).not.toContain('old-guard');
    expect(seasonBadges({ seasonsCompleted: 3 })).toContain('old-guard');
  });

  it('needs 30 assists for executioner', () => {
    expect(seasonBadges({ hangAssists: 29 })).not.toContain('executioner');
    expect(seasonBadges({ hangAssists: 30 })).toContain('executioner');
  });

  it('only raises the book average upward', () => {
    expect(seasonBadges({ currentAverage: 195, lastSeasonBook: 190 })).toContain('raised-book-average');
    expect(seasonBadges({ currentAverage: 185, lastSeasonBook: 190 })).not.toContain('raised-book-average');
  });

  it('needs $100 for money bags', () => {
    expect(seasonBadges({ lifetimeMoneyWon: 99 })).not.toContain('money-bags');
    expect(seasonBadges({ lifetimeMoneyWon: 100 })).toContain('money-bags');
  });
});

describe('counts and dates', () => {
  const nights = [
    { date: '2026-09-04', scores: [300, 190, 180] },
    { date: '2026-09-11', scores: [190, 190, 190] },
    { date: '2026-09-18', scores: [300, 200, 190] },
  ];
  const evaluate = n => badgesFromLeagueNight(n, { average: 190, bookAverage: 190 });

  it('counts a repeatable badge once per night that earns it', () => {
    const h = competitiveBadgeHistory(nights, evaluate, []);
    expect(h['perfect-game'].count).toBe(2);
  });

  it('records the most recent date, not the first', () => {
    const h = competitiveBadgeHistory(nights, evaluate, []);
    expect(h['perfect-game'].lastDate).toBe('2026-09-18');
  });

  // "Earned 4 times" for "three full seasons" would be nonsense.
  it('counts a one-off badge once', () => {
    const h = competitiveBadgeHistory(nights, evaluate, ['old-guard']);
    expect(h['old-guard'].count).toBe(1);
  });

  it('gives an unearned badge zero and no date', () => {
    const h = competitiveBadgeHistory(nights, evaluate, []);
    expect(h['executioner'].count).toBe(0);
    expect(h['executioner'].lastDate).toBe(null);
  });

  it('does not care what order the nights arrive in', () => {
    const shuffled = [nights[2], nights[0], nights[1]];
    expect(competitiveBadgeHistory(shuffled, evaluate, []))
      .toEqual(competitiveBadgeHistory(nights, evaluate, []));
  });

  it('survives an evaluator that throws', () => {
    const bad = () => { throw new Error('nope'); };
    expect(() => competitiveBadgeHistory(nights, bad, [])).not.toThrow();
  });
});

describe('survives junk', () => {
  it('every entry point', () => {
    for (const junk of [null, undefined, 'x', 42, {}, [], [null]]) {
      expect(() => badgesFromLeagueNight(junk, junk)).not.toThrow();
      expect(() => badgesFromTournamentDay(junk, junk)).not.toThrow();
      expect(() => badgesFromPracticeSession(junk, junk)).not.toThrow();
      expect(() => seasonBadges(junk)).not.toThrow();
      expect(() => competitiveBadgeHistory(junk, junk, junk)).not.toThrow();
    }
  });
});
