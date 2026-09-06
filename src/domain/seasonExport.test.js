import { describe, it, expect } from 'vitest';
import { sessionsToCsv, shotsToCsv, seasonSummary, summaryToText } from './seasonExport.js';

describe('sessionsToCsv', () => {
  it('escapes commas and quotes so a league name cannot break a row', () => {
    const out = sessionsToCsv([{ date: '2026-09-01', bowler: 'Ryan', league: 'Fun, "League"', scores: [100], total: 100 }]);
    expect(out.split('\n')[1]).toContain('"Fun, ""League"""');
  });

  it('filters to one bowler', () => {
    const out = sessionsToCsv([
      { date: '2026-09-01', bowler: 'Ryan', league: 'L', scores: [200] },
      { date: '2026-09-01', bowler: 'Aaron', league: 'L', scores: [150] },
    ], 'Ryan');
    expect(out.split('\n')).toHaveLength(2);
  });
});

describe('seasonSummary', () => {
  it('reports no strike rate for a scores-only bowler rather than 0%', () => {
    // A bowler with no shot detail has no strike rate. "0%" would be a lie.
    const sum = seasonSummary([{ bowler: 'Ryan', league: 'L', date: '2026-09-01', scores: [200, 210] }], [], 'Ryan');
    expect(sum.strikeRate).toBeNull();
    expect(summaryToText(sum)).not.toContain('% strikes');
  });

  it('returns null with no games at all', () => {
    expect(seasonSummary([], [], 'Nobody')).toBeNull();
  });

  it('uses singular nouns for counts of one', () => {
    const sum = seasonSummary([{ bowler: 'Ryan', league: 'L', date: '2026-09-01', scores: [205] }], [], 'Ryan');
    expect(summaryToText(sum)).toContain('1 night · 1 game');
    expect(summaryToText(sum)).toContain('1 game over 200');
  });
});
