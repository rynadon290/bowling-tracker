import { describe, it, expect } from 'vitest';
import { CASUAL_BADGES, badgesFor, casualStatsFor, casualLeaderboard } from './casualBadges.js';

const night = (date, scoresByBowler) => ({ date, scoresByBowler });

// A casual bowler has one number per game and nothing else -- no frames,
// no spares, no ball. Every badge has to be earnable from game totals.
describe('CASUAL_BADGES', () => {
  it('offers a real collection to chase', () => {
    expect(CASUAL_BADGES.length).toBeGreaterThanOrEqual(20);
  });

  it('gives every badge an id, name, blurb and rule', () => {
    for (const b of CASUAL_BADGES) {
      expect(b.id).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.blurb).toBeTruthy();
      expect(typeof b.earn).toBe('function');
    }
  });

  it('has no duplicate ids', () => {
    const ids = CASUAL_BADGES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // If they're all hard, most people never earn one and the feature is
  // dead weight for the group least invested in the app.
  it('gives even a weak bowler something', () => {
    const nights = [night('2026-08-01', { Sam: [75, 92, 88], Ryan: [180, 190, 175] })];
    const badges = badgesFor(casualStatsFor('Sam', nights));
    expect(badges.length).toBeGreaterThan(0);
  });

  it('does not award a badge nobody earned', () => {
    const nights = [night('2026-08-01', { Sam: [95, 92, 88] })];
    const ids = badgesFor(casualStatsFor('Sam', nights)).map(b => b.id);
    expect(ids).not.toContain('two-hundred');
    expect(ids).not.toContain('clean-sweep');
  });
});

describe('casualStatsFor', () => {
  const nights = [
    night('2026-08-01', { Ryan: [142, 168, 155], Sam: [120, 99, 143] }),
    night('2026-08-08', { Ryan: [188, 201, 175], Sam: [130, 145, 138] }),
  ];

  it('counts games and nights separately', () => {
    const s = casualStatsFor('Ryan', nights);
    expect(s.games).toBe(6);
    expect(s.nights).toBe(2);
  });

  it('finds the high and low game', () => {
    const s = casualStatsFor('Ryan', nights);
    expect(s.highGame).toBe(201);
    expect(s.lowGame).toBe(142);
  });

  it('counts nights won', () => {
    expect(casualStatsFor('Ryan', nights).nightsWon).toBe(2);
    expect(casualStatsFor('Sam', nights).nightsWon).toBe(0);
  });

  it('spots a clean sweep', () => {
    expect(casualStatsFor('Ryan', nights).sweptANight).toBe(true);
  });

  it('returns nothing for someone who never bowled', () => {
    expect(casualStatsFor('Nobody', nights)).toBeNull();
  });

  it('handles a partial night', () => {
    const s = casualStatsFor('Jess', [night('2026-08-01', { Jess: [161] })]);
    expect(s.games).toBe(1);
    expect(s.average).toBe(161);
  });
});

describe('casualLeaderboard', () => {
  const nights = [
    night('2026-08-01', { Ryan: [142, 168, 155], Sam: [120, 99, 143], Jess: [161, 152, 158] }),
  ];

  it('ranks by average', () => {
    const rows = casualLeaderboard(nights);
    // Jess 157, Ryan 155, Sam 121.
    expect(rows.map(r => r.bowler)).toEqual(['Jess', 'Ryan', 'Sam']);
  });

  // Someone who bowled four games shouldn't outrank someone who bowled
  // three just by playing longer, which is why it ranks on average.
  it('does not reward bowling more games', () => {
    const rows = casualLeaderboard([
      night('2026-08-01', { A: [150, 150], B: [140, 140, 140, 140] }),
    ]);
    expect(rows[0].bowler).toBe('A');
  });

  it('shows each bowler their games count', () => {
    const rows = casualLeaderboard(nights);
    expect(rows.every(r => r.games === 3)).toBe(true);
  });

  it('attaches badges to every row', () => {
    expect(casualLeaderboard(nights).every(r => Array.isArray(r.badges))).toBe(true);
  });

  it('handles no nights at all', () => {
    expect(casualLeaderboard([])).toEqual([]);
  });
});
