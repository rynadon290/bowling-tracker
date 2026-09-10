import { describe, it, expect } from 'vitest';
import {
  scoreSeries, shotRateSeries, seriesFor, linearSlope, trendMetricFor, trendMetricsFor,
  trendDirection, describeTrend, seriesReliability, MIN_POINTS_FOR_DIRECTION,
  allGamesSeries,
  allGamesSummary,
} from './trends.js';

const sessions = [
  { bowler: 'Ryan', league: 'Tue', date: '2026-06-02', scores: [210, 190, 200] },
  { bowler: 'Ryan', league: 'Tue', date: '2026-06-09', scores: [180, 240, 170] },
  { bowler: 'Sam', league: 'Tue', date: '2026-06-02', scores: [100, 100, 100] },
];
const pts = vals => vals.map(v => ({ value: v }));

describe('building a series', () => {
  it('gives one point per night, in date order', () => {
    const s = scoreSeries(sessions, 'Ryan', '', 'average');
    expect(s).toHaveLength(2);
    expect(s[0].date < s[1].date).toBe(true);
  });

  it('truncates averages, like the rest of the app', () => {
    expect(scoreSeries(sessions, 'Ryan', '', 'average')[0].value).toBe(200);
  });

  it('excludes other bowlers', () => {
    expect(scoreSeries(sessions, 'Ryan', '', 'average').some(p => p.value === 100)).toBe(false);
  });

  it('computes strike rate per night with its sample attached', () => {
    const shots = [
      ...Array.from({ length: 20 }, (_, i) => ({ bowler: 'Ryan', league: 'Tue', date: '2026-06-02', ballNum: 1, result: i < 10 ? 'Strike' : 'Other Leave', spareMade: '' })),
    ];
    const s = shotRateSeries(shots, 'Ryan', '', 'strikeRate');
    expect(s[0].value).toBe(50);
    expect(s[0].sample).toBe(20);
  });

  it('survives null input', () => {
    expect(scoreSeries(null, 'Ryan', '', 'average')).toEqual([]);
    expect(seriesFor('nope', { sessions, shots: [] })).toEqual([]);
  });
});

// The point of this module. A line can always be drawn; saying it means
// something is a separate claim that has to earn itself.
describe('only claiming a direction when the data supports one', () => {
  it('refuses to call a direction from too few nights', () => {
    const d = trendDirection(pts([100, 200]));
    expect(d.direction).toBe('unknown');
    expect(d.confident).toBe(false);
    expect(d.pointsNeeded).toBe(MIN_POINTS_FOR_DIRECTION - 2);
  });

  it('reports a steady climb as up', () => {
    const d = trendDirection(pts([170, 180, 190, 200, 210, 220]));
    expect(d.direction).toBe('up');
    expect(d.confident).toBe(true);
    expect(d.total).toBe(50);
  });

  it('reports a steady decline as down', () => {
    expect(trendDirection(pts([220, 210, 200, 190, 180, 170])).direction).toBe('down');
  });

  it('does NOT call scatter a trend', () => {
    const d = trendDirection(pts([190, 150, 210, 160, 205, 155]));
    expect(d.direction).toBe('flat');
    expect(d.confident).toBe(false);
  });

  it('does NOT call a small drift buried in large scatter a trend', () => {
    expect(trendDirection(pts([200, 140, 210, 150, 205, 145])).confident).toBe(false);
  });
});

describe('describing a trend in words', () => {
  it('asks for more nights rather than guessing', () => {
    expect(describeTrend('average', pts([100, 200]))).toContain('more night');
  });

  it('says plainly when movement is within normal variation', () => {
    expect(describeTrend('average', pts([190, 150, 210, 160, 205, 155]))).toContain('No clear direction');
  });

  it('states the direction when it is real', () => {
    expect(describeTrend('average', pts([170, 180, 190, 200, 210, 220]))).toContain('Trending up');
  });
});

describe('flagging thin nights', () => {
  it('flags a rate series built on very few attempts per night', () => {
    expect(seriesReliability('strikeRate', [{ value: 50, sample: 8 }, { value: 60, sample: 9 }]).thin).toBe(true);
  });

  it('does not flag healthy samples', () => {
    expect(seriesReliability('strikeRate', [{ value: 50, sample: 60 }, { value: 60, sample: 70 }]).thin).toBe(false);
  });

  it('never flags score-based metrics, which are not estimates', () => {
    expect(seriesReliability('average', [{ value: 200, sample: 3 }]).thin).toBe(false);
  });
});

describe('individual game positions', () => {
  const sessions = [
    { bowler: 'Ryan', league: 'Tue', date: '2026-06-02', scores: [170, 200, 230] },
    { bowler: 'Ryan', league: 'Tue', date: '2026-06-09', scores: [180, 210, 240] },
  ];

  it('plots the chosen game position, one point per night', () => {
    expect(scoreSeries(sessions, 'Ryan', '', 'game1').map(p => p.value)).toEqual([170, 180]);
    expect(scoreSeries(sessions, 'Ryan', '', 'game3').map(p => p.value)).toEqual([230, 240]);
  });

  // The trap: scores are flattened for most metrics, but a game position
  // must be read per session, or session two's first game reads as game 4.
  it('reads per session when a date has two blocks, not from a flattened list', () => {
    const twoBlocks = [
      { bowler: 'Ryan', league: 'Tue', date: '2026-06-02', scores: [100, 110, 120] },
      { bowler: 'Ryan', league: 'Tue', date: '2026-06-02', scores: [200, 210, 220] },
    ];
    // Both first games averaged: (100 + 200) / 2. Flattening would give 100.
    expect(scoreSeries(twoBlocks, 'Ryan', '', 'game1')[0].value).toBe(150);
    expect(scoreSeries(twoBlocks, 'Ryan', '', 'game3')[0].value).toBe(170);
  });

  it('omits a night that never reached that game rather than plotting a zero', () => {
    const short = [{ bowler: 'Ryan', league: 'Tue', date: '2026-06-02', scores: [190, 195] }];
    expect(scoreSeries(short, 'Ryan', '', 'game3')).toEqual([]);
    expect(scoreSeries(short, 'Ryan', '', 'game2')[0].value).toBe(195);
  });
});

describe('ten pin spare rate', () => {
  const isTenPin = shot => shot.result === 'Weak 10' || shot.result === 'Ringing 10' ||
    (shot.result === 'Other Leave' && (shot.otherLeave || []).filter(p => p !== '9 Pin No-Tap').join() === '10');
  const tens = (date, n, made) => Array.from({ length: n }, (_, i) => ({
    bowler: 'Ryan', league: 'Tue', date, ballNum: 1, result: 'Other Leave',
    otherLeave: ['10'], spareMade: i < made ? 'Yes' : 'No',
  }));

  it('computes conversion per night', () => {
    const s = shotRateSeries([...tens('2026-06-02', 10, 6), ...tens('2026-06-09', 10, 8)],
      'Ryan', '', 'tenPinSpareRate', () => false, isTenPin);
    expect(s.map(p => p.value)).toEqual([60, 80]);
  });

  it('excludes leaves with no outcome recorded, which are unfinished frames not misses', () => {
    const rows = [...tens('2026-06-16', 4, 4),
      { bowler: 'Ryan', league: 'Tue', date: '2026-06-16', ballNum: 1, result: 'Other Leave', otherLeave: ['10'], spareMade: '' }];
    const s = shotRateSeries(rows, 'Ryan', '', 'tenPinSpareRate', () => false, isTenPin);
    expect(s[0].sample).toBe(4);
    expect(s[0].value).toBe(100);
  });

  it('counts weak and ringing tens as ten pin leaves', () => {
    const rows = [
      { bowler: 'Ryan', league: 'Tue', date: '2026-06-23', ballNum: 1, result: 'Weak 10', spareMade: 'Yes' },
      { bowler: 'Ryan', league: 'Tue', date: '2026-06-23', ballNum: 1, result: 'Ringing 10', spareMade: 'No' },
    ];
    const s = shotRateSeries(rows, 'Ryan', '', 'tenPinSpareRate', () => false, isTenPin);
    expect(s[0].sample).toBe(2);
    expect(s[0].value).toBe(50);
  });
});

describe('corner pin trend follows the bowler\'s hand', () => {
  it('relabels the metric for a left-handed bowler, keeping the id stable', () => {
    expect(trendMetricFor('tenPinSpareRate', true).label).toBe('7 Pin Spare %');
    expect(trendMetricFor('tenPinSpareRate', true).id).toBe('tenPinSpareRate');
    expect(trendMetricFor('tenPinSpareRate', false).label).toBe('10 Pin Spare %');
  });

  it('leaves every other metric label alone', () => {
    expect(trendMetricsFor(true).find(m => m.id === 'strikeRate').label).toBe('Strike %');
    expect(trendMetricsFor(true).filter(m => m.label.includes('7 Pin'))).toHaveLength(1);
  });

  it('reads the pin the bowler actually leaves', () => {
    const sevens = Array.from({ length: 10 }, (_, i) => ({
      bowler: 'R', league: 'T', date: '2026-06-02', ballNum: 1,
      result: 'Other Leave', otherLeave: ['7'], spareMade: i < 6 ? 'Yes' : 'No',
    }));
    const asLefty = shotRateSeries(sevens, 'R', '', 'tenPinSpareRate', () => false,
      s => (s.otherLeave || []).join() === '7');
    expect(asLefty[0].value).toBe(60);
    // The right-handed test ignores them entirely.
    const asRighty = shotRateSeries(sevens, 'R', '', 'tenPinSpareRate', () => false,
      s => (s.otherLeave || []).join() === '10');
    expect(asRighty).toEqual([]);
  });
});

// A nightly average hides the spread: 190/190/190 and 140/240/190 plot
// as the same point. This plots every game.
describe('every game series', () => {
  const sessions = [
    { bowler: 'R', league: 'Tue', date: '2026-08-27', scores: [190, 190, 190] },
    { bowler: 'R', league: 'Tue', date: '2026-09-01', scores: [140, 240, 190] },
    { bowler: 'R', league: 'Thu', date: '2026-09-03', scores: [200, 210] },
  ];

  it('gives one point per game, not per night', () => {
    expect(allGamesSeries(sessions, 'R', null)).toHaveLength(8);
  });

  it('still honours the league filter', () => {
    expect(allGamesSeries(sessions, 'R', 'Tue')).toHaveLength(6);
  });

  // Several games share a date, so a date axis would stack them.
  it('indexes games so same-night games do not collide', () => {
    const pts = allGamesSeries(sessions, 'R', null);
    expect(new Set(pts.map(p => p.x)).size).toBe(pts.length);
    expect(pts.filter(p => p.date === '2026-09-01').map(p => p.value)).toEqual([140, 240, 190]);
  });

  it('reports the spread, which is the reason to look at all', () => {
    const s = allGamesSummary(allGamesSeries(sessions, 'R', null));
    expect(s.games).toBe(8);
    expect(s.high).toBe(240);
    expect(s.low).toBe(140);
    expect(s.spread).toBe(100);
  });

  it('is empty rather than throwing with no sessions', () => {
    expect(allGamesSeries([], 'R', null)).toEqual([]);
    expect(allGamesSummary([])).toBeNull();
  });
});

// Direction must match the data, and scatter must NOT be reported as a
// trend — telling a bowler their average is climbing when it's noise is
// worse than saying nothing.
describe('trend direction on known series', () => {
  const pts = vals => vals.map((value, i) => ({ value, date: `2026-09-${String(i + 1).padStart(2, '0')}` }));

  it('reads a steadily rising series as up', () => {
    const d = trendDirection(pts([150, 158, 165, 172, 180, 188]));
    expect(d.direction).toBe('up');
    expect(d.confident).toBe(true);
  });

  it('reads a steadily falling series as down', () => {
    expect(trendDirection(pts([188, 180, 172, 165, 158, 150])).direction).toBe('down');
  });

  it('refuses to call scatter a trend', () => {
    const d = trendDirection(pts([170, 140, 200, 150, 190, 160]));
    expect(d.direction).toBe('flat');
    expect(d.confident).toBe(false);
  });

  it('says how many more nights it needs rather than guessing', () => {
    const d = trendDirection(pts([150, 160]));
    expect(d.direction).toBe('unknown');
    expect(d.pointsNeeded).toBeGreaterThan(0);
  });

  it('does not throw on junk', () => {
    for (const v of [null, undefined, 'x', 0, {}, []]) {
      expect(() => trendDirection(v)).not.toThrow();
    }
  });
});
