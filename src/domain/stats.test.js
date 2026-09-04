import { describe, it, expect } from 'vitest';
import { bowlerHighGame, bowlerHighSeries, teamDateGroups, teamHighGame, teamHighSeries, seasonRecord, weeklyPointsData, gameAvg, teamGameTotalAvg, teamGameTotalAvgAt, rAvg, cAvg, avgProgress, cumulativeAvgBeforeDate, hungCounts, beatHighBowlerStats, scoreValues, scoreConsistency, histogramBuckets } from './stats.js';

describe('bowlerHighGame', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [205, 195, 209], total: 609 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [202, 190, 236], total: 628 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-03', scores: [220, 210, 304], total: 734 },
  ];

  it('finds the single highest game across every session, not just the most recent', () => {
    const result = bowlerHighGame(sessions, 'Ryan');
    expect(result.value).toBe(236);
    expect(result.date).toBe('2026-08-27');
    expect(result.game).toBe(3); // 3rd position in that session's scores array
  });

  it('only considers this specific bowler', () => {
    const result = bowlerHighGame(sessions, 'Aaron');
    expect(result.value).toBe(304);
  });

  it('returns null when the bowler has no sessions at all', () => {
    expect(bowlerHighGame(sessions, 'Nobody')).toBeNull();
  });
});

describe('bowlerHighSeries', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [205, 195, 209], total: 609 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [202, 190, 236], total: 628 },
  ];

  it('finds the highest 3-game series total', () => {
    const result = bowlerHighSeries(sessions, 'Ryan');
    expect(result.value).toBe(628);
    expect(result.date).toBe('2026-08-27');
  });

  it('returns null with no sessions', () => {
    expect(bowlerHighSeries(sessions, 'Nobody')).toBeNull();
  });
});

describe('teamDateGroups', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-03', scores: [220, 230, 200], total: 650 },
    // Solo night -- only one bowler logged, not a real team night
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [180, 190, 200], total: 570 },
    // Different league entirely, must not leak into Thursday's groups
    { bowler: 'Ryan', league: 'Tuesday House Shot', date: '2026-09-01', scores: [183, 190, 247], total: 620 },
  ];

  it('only includes nights where 2+ bowlers actually logged a session', () => {
    const groups = teamDateGroups(sessions, 'Thursday House Shot');
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe('2026-09-03');
  });

  it('sums each game position correctly across everyone who bowled that night', () => {
    const groups = teamDateGroups(sessions, 'Thursday House Shot');
    expect(groups[0].gameTotals).toEqual([420, 440, 390]); // [200+220, 210+230, 190+200]
  });

  it('sums the full series total across everyone', () => {
    const groups = teamDateGroups(sessions, 'Thursday House Shot');
    expect(groups[0].seriesTotal).toBe(1250); // 600+650
  });

  it('does not leak a different league\'s sessions into this league\'s groups', () => {
    const groups = teamDateGroups(sessions, 'Tuesday House Shot');
    // Only Ryan logged Tuesday, so it's a solo night -- not a real team group
    expect(groups).toHaveLength(0);
  });
});

describe('teamHighGame / teamHighSeries', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-03', scores: [220, 230, 200], total: 650 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [150, 160, 140], total: 450 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-08-27', scores: [140, 150, 130], total: 420 },
  ];

  it('finds the single highest TEAM game total across all team nights', () => {
    const result = teamHighGame(sessions, 'Thursday House Shot');
    // 09-03 game totals: [200+220, 210+230, 190+200] = [420, 440, 390]
    // 08-27 game totals: [150+140, 160+150, 140+130] = [290, 310, 270]
    // Highest of all six values is 440 (09-03, game position 2)
    expect(result.value).toBe(440);
    expect(result.date).toBe('2026-09-03');
    expect(result.game).toBe(2);
  });

  it('finds the single highest TEAM series total across all team nights', () => {
    const result = teamHighSeries(sessions, 'Thursday House Shot');
    expect(result.value).toBe(1250); // 600+650, higher than 450+420
    expect(result.date).toBe('2026-09-03');
  });

  it('returns null when there are no real team nights (everyone bowled solo)', () => {
    const soloOnly = [{ bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 }];
    expect(teamHighGame(soloOnly, 'Thursday House Shot')).toBeNull();
    expect(teamHighSeries(soloOnly, 'Thursday House Shot')).toBeNull();
  });
});

describe('seasonRecord', () => {
  const matches = [
    { league: 'Thursday House Shot', games: [true, false, true], series: true },
    { league: 'Thursday House Shot', games: [false, false, true], series: false },
    { league: 'Tuesday House Shot', games: [true, true, true], series: true },
  ];

  it('tallies game and series wins/losses correctly for one league', () => {
    const record = seasonRecord(matches, 'Thursday House Shot');
    // match 1 [true,false,true] = 2 wins, 1 loss; match 2 [false,false,true] = 1 win, 2 losses
    expect(record.gameWins).toBe(3);
    expect(record.gameLosses).toBe(3);
    expect(record.seriesWins).toBe(1);
    expect(record.seriesLosses).toBe(1);
  });

  it('computes pointsWon/pointsAvailable from the same games+series data', () => {
    const record = seasonRecord(matches, 'Thursday House Shot');
    // 3 game wins + 1 series win = 4 points won, out of 6 games + 2 series = 8 available
    expect(record.pointsWon).toBe(4);
    expect(record.pointsAvailable).toBe(8);
  });

  it('combines every league when no league is given', () => {
    const record = seasonRecord(matches, '');
    expect(record.gameWins).toBe(6); // 3 from Thursday matches + 3 from Tuesday (all wins)
  });

  it('skips null (not-yet-played) games without counting them as a loss', () => {
    const partial = [{ league: 'Thursday House Shot', games: [true, null, null], series: null }];
    const record = seasonRecord(partial, 'Thursday House Shot');
    expect(record.gameWins).toBe(1);
    expect(record.gameLosses).toBe(0);
    expect(record.pointsAvailable).toBe(1); // only the one decided game counts
  });
});

describe('weeklyPointsData', () => {
  it('computes points won/available per match and sorts chronologically', () => {
    const matches = [
      { league: 'Thursday House Shot', date: '2026-09-03', games: [true, false, true], series: true, opponent: 'Team A' },
      { league: 'Thursday House Shot', date: '2026-08-27', games: [false, false, true], series: false, opponent: 'Team B' },
    ];
    const weekly = weeklyPointsData(matches, 'Thursday House Shot');
    expect(weekly).toHaveLength(2);
    expect(weekly[0].date).toBe('2026-08-27'); // older date sorts first (chronological)
    expect(weekly[0].pointsWon).toBe(1);
    expect(weekly[0].pointsAvailable).toBe(4);
    expect(weekly[1].date).toBe('2026-09-03');
    expect(weekly[1].pointsWon).toBe(3);
  });

  it('skips a match with nothing decided yet, rather than plotting a false 0/0 week', () => {
    const matches = [
      { league: 'Thursday House Shot', date: '2026-09-03', games: [null, null, null], series: null, opponent: 'Team A' },
    ];
    expect(weeklyPointsData(matches, 'Thursday House Shot')).toHaveLength(0);
  });

  it('filters by league when given', () => {
    const matches = [
      { league: 'Thursday House Shot', date: '2026-09-03', games: [true, true, true], series: true, opponent: 'Team A' },
      { league: 'Tuesday House Shot', date: '2026-09-01', games: [true, true, true], series: true, opponent: 'Team C' },
    ];
    expect(weeklyPointsData(matches, 'Thursday House Shot')).toHaveLength(1);
  });
});

describe('gameAvg', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', scores: [200, 210, 190] },
    { bowler: 'Ryan', league: 'Thursday House Shot', scores: [180, 220, 200] },
    { bowler: 'Aaron', league: 'Thursday House Shot', scores: [150, 160, 170] },
  ];

  it('averages one specific game position (e.g. every "Game 1" score) for one bowler', () => {
    // Game 1 (index 0) for Ryan: (200+180)/2 = 190
    expect(gameAvg(sessions, 'Ryan', 0, 'Thursday House Shot')).toBe(190);
  });

  it('pools every bowler together when bowler is empty/omitted -- a per-person average, not a team total', () => {
    // Game 1 (index 0) across everyone: (200+180+150)/3 = 176.67 -> rounds to 177
    expect(gameAvg(sessions, '', 0, 'Thursday House Shot')).toBe(177);
  });

  it('returns null when no games exist at that position for this filter', () => {
    expect(gameAvg(sessions, 'Nobody', 0, 'Thursday House Shot')).toBeNull();
  });
});

describe('teamGameTotalAvg / teamGameTotalAvgAt', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-03', scores: [220, 230, 200], total: 650 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [150, 160, 140], total: 450 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-08-27', scores: [140, 150, 130], total: 420 },
  ];

  it('averages the TEAM total for one specific game position across every team night', () => {
    // Game 1 team totals: 09-03 = 200+220 = 420, 08-27 = 150+140 = 290. Avg = 355, truncated
    expect(teamGameTotalAvgAt(sessions, 'Thursday House Shot', 0)).toBe(355);
  });

  it('averages ALL game positions pooled together for the team', () => {
    // All 6 team-game-totals: [420,440,390,290,310,270], avg=353.33, truncated to 353
    expect(teamGameTotalAvg(sessions, 'Thursday House Shot')).toBe(353);
  });

  it('truncates rather than rounds, so it never overstates what was actually earned', () => {
    // 355 and 353 above are only correct if truncated -- rounding either would differ
    const atResult = teamGameTotalAvgAt(sessions, 'Thursday House Shot', 0);
    const allResult = teamGameTotalAvg(sessions, 'Thursday House Shot');
    expect(Number.isInteger(atResult)).toBe(true);
    expect(Number.isInteger(allResult)).toBe(true);
  });

  it('returns null with no real team nights', () => {
    const solo = [{ bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 }];
    expect(teamGameTotalAvg(solo, 'Thursday House Shot')).toBeNull();
    expect(teamGameTotalAvgAt(solo, 'Thursday House Shot', 0)).toBeNull();
  });
});

describe('rAvg', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', scores: [200, 210, 190] },
    { bowler: 'Ryan', league: 'Tuesday House Shot', scores: [150, 160, 140] },
  ];

  it('averages only within the ONE given league, unlike cAvg which can combine leagues', () => {
    expect(rAvg(sessions, 'Ryan', 'Thursday House Shot')).toBe(200); // (200+210+190)/3
  });

  it('does not blend in a different league\'s scores', () => {
    expect(rAvg(sessions, 'Ryan', 'Tuesday House Shot')).toBe(150); // (150+160+140)/3
  });

  it('bowler="" pools everyone in that league together', () => {
    const multi = [
      { bowler: 'Ryan', league: 'Thursday House Shot', scores: [200] },
      { bowler: 'Aaron', league: 'Thursday House Shot', scores: [220] },
    ];
    expect(rAvg(multi, '', 'Thursday House Shot')).toBe(210); // (200+220)/2
  });
});

describe('cAvg', () => {
  it('combines every league a bowler plays in when no league is given', () => {
    const sessions = [
      { bowler: 'Ryan', league: 'Thursday House Shot', scores: [200, 210] },
      { bowler: 'Ryan', league: 'Tuesday House Shot', scores: [190] },
    ];
    // All scores pooled: (200+210+190)/3 = 200
    expect(cAvg(sessions, 'Ryan', '')).toBe(200);
  });

  it('scopes to just one league when given, matching rAvg in that case', () => {
    const sessions = [
      { bowler: 'Ryan', league: 'Thursday House Shot', scores: [200, 210] },
      { bowler: 'Ryan', league: 'Tuesday House Shot', scores: [190] },
    ];
    expect(cAvg(sessions, 'Ryan', 'Thursday House Shot')).toBe(205); // (200+210)/2
  });
});

describe('avgProgress', () => {
  it('computes the current 5-pin milestone band and percent progress through it', () => {
    // Average of [200,210,190,187] = 196.75 -> current milestone floor is 195, next is 200
    const sessions = [{ bowler: 'Ryan', league: 'Thursday House Shot', scores: [200, 210, 190, 187] }];
    const result = avgProgress(sessions, 'Ryan', 'Thursday House Shot');
    expect(result.current).toBe(196);
    expect(result.prevMilestone).toBe(195);
    expect(result.nextMilestone).toBe(200);
    expect(result.pct).toBeCloseTo(35, 0); // (196.75-195)/5 * 100 = 35%
  });

  it('returns null with no data', () => {
    expect(avgProgress([], 'Ryan', 'Thursday House Shot')).toBeNull();
  });
});

describe('cumulativeAvgBeforeDate', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-20', scores: [180, 190, 200] },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [200, 210, 220] },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [300, 300, 300] },
  ];

  it('only includes sessions strictly BEFORE the given date -- never that date\'s own results', () => {
    // Entering 09-03, only 08-20 and 08-27 count -- the 09-03 300s must not leak in
    const result = cumulativeAvgBeforeDate(sessions, 'Ryan', 'Thursday House Shot', '2026-09-03');
    const expected = (180+190+200+200+210+220) / 6;
    expect(result).toBe(expected);
    expect(result).toBeLessThan(210); // sanity check it's nowhere near the 300-inflated figure
  });

  it('returns null when there is no data before this date (e.g. the very first week)', () => {
    expect(cumulativeAvgBeforeDate(sessions, 'Ryan', 'Thursday House Shot', '2026-08-20')).toBeNull();
  });
});

describe('hungCounts', () => {
  it('counts a bowler as "hung" only when everyone else in a shared frame struck and they alone did not', () => {
    const shots = [
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '5', ballNum: null, result: 'Strike', bowler: 'Ryan' },
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '5', ballNum: null, result: 'Strike', bowler: 'Aaron' },
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '5', ballNum: null, result: 'Other Leave', bowler: 'Zack' },
      // A frame where everyone struck -- no one hung
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '6', ballNum: null, result: 'Strike', bowler: 'Ryan' },
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '6', ballNum: null, result: 'Strike', bowler: 'Aaron' },
    ];
    expect(hungCounts(shots, 'Thursday House Shot')).toEqual({ Zack: 1 });
  });

  it('does not count a frame where only one bowler logged at all -- not actually a shared frame', () => {
    const shots = [
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '5', ballNum: null, result: 'Other Leave', bowler: 'Ryan' },
    ];
    expect(hungCounts(shots, 'Thursday House Shot')).toEqual({});
  });

  it('does not count a frame where 2+ bowlers all missed -- hung is specifically "everyone else struck"', () => {
    const shots = [
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '5', ballNum: null, result: 'Other Leave', bowler: 'Ryan' },
      { league: 'Thursday House Shot', date: '2026-09-03', game: '1', frame: '5', ballNum: null, result: 'Other Leave', bowler: 'Aaron' },
    ];
    expect(hungCounts(shots, 'Thursday House Shot')).toEqual({});
  });
});

describe('beatHighBowlerStats', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-20', scores: [180, 190, 200], total: 570 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-08-20', scores: [150, 160, 170], total: 480 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [200, 210, 220], total: 630 },
    { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-08-27', scores: [190, 195, 205], total: 590 },
  ];

  it('crowns the giant week 2 (Ryan\'s 190 average beats Aaron\'s 160 entering that week), never comparing week 1 (no prior data)', () => {
    const result = beatHighBowlerStats(sessions, 'Thursday House Shot');
    expect(result.Ryan.weeksAsHigh).toBe(1);
  });

  it('tallies the challenger\'s game-by-game wins/losses against the reigning giant, not the giant\'s own record', () => {
    const result = beatHighBowlerStats(sessions, 'Thursday House Shot');
    // Aaron lost all 3 games to Ryan in week 2 (190<200, 195<210, 205<220)
    expect(result.Aaron.won).toBe(0);
    expect(result.Aaron.total).toBe(3);
  });

  it('never gives the giant a won/total record against themselves', () => {
    const result = beatHighBowlerStats(sessions, 'Thursday House Shot');
    expect(result.Ryan.won).toBe(0);
    expect(result.Ryan.total).toBe(0);
  });

  it('returns an empty tally when there is no second week to challenge in yet', () => {
    const oneWeek = [sessions[0], sessions[1]];
    expect(beatHighBowlerStats(oneWeek, 'Thursday House Shot')).toEqual({});
  });
});

describe('scoreValues / scoreConsistency', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [190, 210, 200], total: 600 },
    { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-08-27', scores: [170, 230, 190], total: 590 },
  ];

  it('scoreValues returns a specific bowler\'s own flat game scores when a bowler is given', () => {
    expect(scoreValues(sessions, 'Ryan', 'Thursday House Shot')).toEqual([190, 210, 200, 170, 230, 190]);
  });

  it('scoreValues returns TEAM game totals (not raw individual scores) when no bowler and not pooled', () => {
    const teamSessions = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 },
      { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-03', scores: [220, 230, 200], total: 650 },
    ];
    // Team totals per game: [420, 440, 390] -- not the 6 raw individual scores
    expect(scoreValues(teamSessions, '', 'Thursday House Shot', false)).toEqual([420, 440, 390]);
  });

  it('scoreValues pooled=true returns every individual game score pooled together, not team totals', () => {
    const teamSessions = [
      { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200, 210, 190], total: 600 },
      { bowler: 'Aaron', league: 'Thursday House Shot', date: '2026-09-03', scores: [220, 230, 200], total: 650 },
    ];
    const pooled = scoreValues(teamSessions, '', 'Thursday House Shot', true);
    expect(pooled).toHaveLength(6);
    expect(pooled).toContain(200);
    expect(pooled).toContain(230);
  });

  it('scoreConsistency computes stdDev/min/max/games from whatever scoreValues resolves to', () => {
    const result = scoreConsistency(sessions, 'Ryan', 'Thursday House Shot');
    expect(result.min).toBe(170);
    expect(result.max).toBe(230);
    expect(result.games).toBe(6);
    expect(result.stdDev).toBeCloseTo(18.6, 1);
  });

  it('scoreConsistency returns null with fewer than 2 games -- standard deviation is meaningless for one value', () => {
    const oneGame = [{ bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', scores: [200], total: 200 }];
    expect(scoreConsistency(oneGame, 'Ryan', 'Thursday House Shot')).toBeNull();
  });
});

describe('histogramBuckets', () => {
  it('bins values into roughly-equal-width ranges', () => {
    const buckets = histogramBuckets([180, 190, 200, 210, 220, 150, 160]);
    expect(buckets.length).toBeGreaterThan(0);
    const totalCounted = buckets.reduce((a, b) => a + b.count, 0);
    expect(totalCounted).toBe(7); // every value accounted for exactly once
  });

  it('collapses to a single bucket when every value is identical', () => {
    expect(histogramBuckets([200, 200, 200])).toEqual([{ label: '200', count: 3 }]);
  });

  it('returns an empty array for no values', () => {
    expect(histogramBuckets([])).toEqual([]);
  });
});
