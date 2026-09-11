import { describe, it, expect } from 'vitest';
import {
  hasTeamForLeague, leagueSessionCount, shouldPromptForTeam, scoresToAdopt,
} from './teamPrompt.js';

const L = 'Tuesday House Shot';
const night = (bowler, league) => ({ bowler, league, date: '2026-09-11' });
const base = {
  environment: 'league', league: L, teams: [], bowler: 'Ryan',
  sessions: [night('Ryan', L)], dismissed: false,
};

describe('hasTeamForLeague', () => {
  it('matches a team by league name', () => {
    expect(hasTeamForLeague([{ id: 't1', name: 'Split Happens', league: L }], L)).toBe(true);
  });

  it('does not match a team in a different league', () => {
    expect(hasTeamForLeague([{ league: 'Thursday Mixed' }], L)).toBe(false);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}, [null], [42]]) {
      expect(() => hasTeamForLeague(junk, L)).not.toThrow();
      expect(hasTeamForLeague(junk, L)).toBe(false);
    }
    expect(hasTeamForLeague([{ league: L }], null)).toBe(false);
  });
});

describe('leagueSessionCount', () => {
  it('counts only this bowler in this league', () => {
    const sessions = [night('Ryan', L), night('Maggie', L), night('Ryan', 'Thursday Mixed')];
    expect(leagueSessionCount(sessions, 'Ryan', L)).toBe(1);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(leagueSessionCount(junk, 'Ryan', L)).toBe(0);
    }
  });
});

describe('shouldPromptForTeam', () => {
  // The point of the whole change: ask AFTER a night, not before one.
  // Asking first is the wall again in a friendlier font.
  it('stays silent until a night has actually been logged', () => {
    expect(shouldPromptForTeam({ ...base, sessions: [] })).toBe(false);
  });

  it('asks once a league night exists with no team', () => {
    expect(shouldPromptForTeam(base)).toBe(true);
  });

  it('says nothing once a team exists for that league', () => {
    expect(shouldPromptForTeam({ ...base, teams: [{ league: L }] })).toBe(false);
  });

  // A prompt people learn to swipe away is worse than none: it teaches
  // them to ignore the one place the app asks for something.
  it('never asks again once dismissed', () => {
    expect(shouldPromptForTeam({ ...base, dismissed: true })).toBe(false);
    expect(shouldPromptForTeam({
      ...base, dismissed: true,
      sessions: Array.from({ length: 30 }, () => night('Ryan', L)),
    })).toBe(false);
  });

  // Practice, tournaments and open bowling have no teams to attach
  // anything to. Asking there would be nonsense.
  it('only ever applies to league bowling', () => {
    for (const environment of ['practice', 'tournament', 'casual']) {
      expect(shouldPromptForTeam({ ...base, environment })).toBe(false);
    }
  });

  it('stays silent with no league chosen', () => {
    expect(shouldPromptForTeam({ ...base, league: '' })).toBe(false);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, [], {}]) {
      expect(() => shouldPromptForTeam(junk)).not.toThrow();
      expect(shouldPromptForTeam(junk)).toBe(false);
    }
  });
});

describe('scoresToAdopt', () => {
  const rows = [
    { id: 'a', bowler: 'Ryan', league: L, teamId: '' },
    { id: 'b', bowler: 'Ryan', league: L, teamId: 'existing-team' },
    { id: 'c', bowler: 'Maggie', league: L, teamId: '' },
    { id: 'd', bowler: 'Ryan', league: 'Thursday Mixed', teamId: '' },
  ];

  it('adopts this bowler\'s team-less scores in this league', () => {
    expect(scoresToAdopt(rows, 'Ryan', L).map(r => r.id)).toEqual(['a']);
  });

  // A score already filed against another team is not ours to move.
  it('never reassigns a score that already belongs to a team', () => {
    expect(scoresToAdopt(rows, 'Ryan', L).some(r => r.id === 'b')).toBe(false);
  });

  it('never touches another bowler or another league', () => {
    const ids = scoresToAdopt(rows, 'Ryan', L).map(r => r.id);
    expect(ids).not.toContain('c');
    expect(ids).not.toContain('d');
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}, [null, 7]]) {
      expect(() => scoresToAdopt(junk, 'Ryan', L)).not.toThrow();
      expect(scoresToAdopt(junk, 'Ryan', L)).toEqual([]);
    }
  });
});
