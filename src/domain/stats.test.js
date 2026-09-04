import { describe, it, expect } from 'vitest';
import { bowlerHighGame, bowlerHighSeries, teamDateGroups, teamHighGame, teamHighSeries, seasonRecord, weeklyPointsData } from './stats.js';

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
