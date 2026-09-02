import { describe, it, expect } from 'vitest';
import {
  shotToSupabaseRow, shotFromSupabaseRow,
  sessionToSupabaseRow, sessionFromSupabaseRow,
} from './supabaseMapping.js';

describe('shot <-> Supabase row mapping', () => {
  const leagueIdsMap = { 'Thursday House Shot': 'league-uuid-1' };
  const leagueNameById = { 'league-uuid-1': 'Thursday House Shot' };

  it('round-trips a 9 Pin No-Tap shot exactly, including the display fields', () => {
    const original = {
      id: 'shot-uuid-1', bowler: 'Ryan', teamId: 'team-1', league: 'Thursday House Shot',
      date: '2026-09-04', lane: '7', game: '1', frame: '5', ballNum: null,
      ball: 'Bionic', surface: '2000', startingBoard: '15', targetArrows: '10',
      result: 'Strike', otherLeave: ['9 Pin No-Tap'], spareMade: '', strikeDescription: '',
      release: 'Good', miss: [], ballChangeReason: [], pinCount: '',
      notes: 'Felt great',
      _displayResult: 'Other Leave', _displayLeave: ['9 Pin No-Tap'],
    };

    const row = shotToSupabaseRow(original, 'user-uuid-1', leagueIdsMap);
    const roundTripped = shotFromSupabaseRow(row, leagueNameById);

    const fields = ['bowler', 'league', 'date', 'lane', 'ball', 'surface', 'startingBoard',
      'targetArrows', 'result', 'otherLeave', 'spareMade', 'strikeDescription', 'release',
      'miss', 'ballChangeReason', 'pinCount', 'notes', '_displayResult', '_displayLeave'];
    fields.forEach(f => expect(roundTripped[f]).toEqual(original[f]));
  });

  it('converts game/frame to integers for storage and back to strings for the client', () => {
    const shot = { id: 'x', game: '1', frame: '5', league: 'Thursday House Shot' };
    const row = shotToSupabaseRow(shot, 'u1', leagueIdsMap);
    expect(row.game).toBe(1);
    expect(row.frame).toBe(5);
    const back = shotFromSupabaseRow(row, leagueNameById);
    expect(back.game).toBe('1');
    expect(back.frame).toBe('5');
  });

  it('resolves league_id from the league name via the provided map', () => {
    const shot = { id: 'x', game: '1', frame: '1', league: 'Thursday House Shot' };
    const row = shotToSupabaseRow(shot, 'u1', leagueIdsMap);
    expect(row.league_id).toBe('league-uuid-1');
  });

  it('an unknown league name resolves to null rather than throwing', () => {
    const shot = { id: 'x', game: '1', frame: '1', league: 'Some Unknown League' };
    const row = shotToSupabaseRow(shot, 'u1', leagueIdsMap);
    expect(row.league_id).toBeNull();
  });
});

describe('session <-> Supabase row mapping', () => {
  const leagueIdsMap = { 'Thursday House Shot': 'league-uuid-1' };
  const leagueNameById = { 'league-uuid-1': 'Thursday House Shot' };

  it('round-trips a full session exactly', () => {
    const original = {
      id: 'session-uuid-1', bowler: 'Ryan', teamId: 'team-1', league: 'Thursday House Shot', date: '2026-08-28',
      scores: [202, 190, 236], total: 628, average: 209,
      shotCount: 32, strikes: 14, weakTens: 2, ringingTens: 2,
      tenPinLeaves: 4, singlePinLeaves: 5, singlePinSpares: 4,
      spareAttempts: 14, sparesMade: 13, splits: 1, splitsConverted: 1,
      ballsUsed: ['Bionic', 'Phaze II Solid'], misses: ['Left', 'Fast'], releases: ['Good', 'Good', 'Bad'],
    };

    const row = sessionToSupabaseRow(original, 'user-uuid-1', leagueIdsMap);
    const roundTripped = sessionFromSupabaseRow(row, leagueNameById);

    const fields = ['bowler', 'league', 'date', 'scores', 'total', 'average', 'shotCount',
      'strikes', 'weakTens', 'ringingTens', 'tenPinLeaves', 'singlePinLeaves', 'singlePinSpares',
      'spareAttempts', 'sparesMade', 'splits', 'splitsConverted', 'ballsUsed', 'misses', 'releases'];
    fields.forEach(f => expect(roundTripped[f]).toEqual(original[f]));
  });

  it('the scores array survives as real numbers, not strings', () => {
    const original = { id: 'x', league: 'Thursday House Shot', date: '2026-08-28', scores: [200, 210, 220] };
    const row = sessionToSupabaseRow(original, 'u1', leagueIdsMap);
    const back = sessionFromSupabaseRow(row, leagueNameById);
    expect(back.scores.every(s => typeof s === 'number')).toBe(true);
  });
});
