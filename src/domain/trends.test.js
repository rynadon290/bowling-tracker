import { describe, it, expect } from 'vitest';
import {
  scoreSeries, shotRateSeries, seriesFor, linearSlope,
  trendDirection, describeTrend, seriesReliability, MIN_POINTS_FOR_DIRECTION,
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
