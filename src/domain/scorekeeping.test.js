import { describe, it, expect } from 'vitest';
import {
  allowsOtherBowlers, otherBowlerSource, guestsAreLocalOnly,
  scorekeepingOptions, addGuest, normalizeGuests,
} from './scorekeeping.js';

describe('who you can keep score for', () => {
  const teams = [
    { id: 't1', name: 'Gutter Kings', league: 'Thursday', members: ['Ryan', 'Aaron', 'Sub Slot'] },
    { id: 't2', name: 'Other', league: 'Tuesday', members: ['Lee'] },
  ];

  it('never offers anyone else in a tournament', () => {
    // You bowl your own squad and record your own results. Offering the
    // option only creates a way to file your scores under another name.
    expect(allowsOtherBowlers('tournament')).toBe(false);
    expect(scorekeepingOptions({ environment: 'tournament', owner: 'Ryan', teams, guests: ['X'] }))
      .toEqual(['Ryan']);
  });

  it('offers league teammates and roster placeholders', () => {
    expect(scorekeepingOptions({ environment: 'league', owner: 'Ryan', league: 'Thursday', teams }))
      .toEqual(['Ryan', 'Aaron', 'Sub Slot']);
  });

  it('scopes league options to the league being bowled', () => {
    expect(scorekeepingOptions({ environment: 'league', owner: 'Ryan', league: 'Tuesday', teams }))
      .toEqual(['Ryan', 'Lee']);
  });

  it('lists the owner once even when they are on the roster', () => {
    const out = scorekeepingOptions({ environment: 'league', owner: 'Ryan', league: 'Thursday', teams });
    expect(out.filter(n => n === 'Ryan')).toHaveLength(1);
  });

  it('uses free-text guests in practice, ignoring the roster', () => {
    expect(scorekeepingOptions({ environment: 'practice', owner: 'Ryan', teams, guests: ['Dave'] }))
      .toEqual(['Ryan', 'Dave']);
  });
});

describe('guest privacy', () => {
  it('marks practice and casual guests as local-only', () => {
    // These are names typed about people who aren't users of this app and
    // haven't agreed to anything, so they never leave the device.
    expect(guestsAreLocalOnly('practice')).toBe(true);
    expect(guestsAreLocalOnly('casual')).toBe(true);
  });

  it('does not treat league teammates as local-only', () => {
    // Those are real roster members with their own accounts.
    expect(guestsAreLocalOnly('league')).toBe(false);
    expect(otherBowlerSource('league')).toBe('roster');
  });
});

describe('guest list', () => {
  it('dedupes case-insensitively so one person is not two', () => {
    expect(addGuest(['Dave'], 'dave')).toEqual(['Dave']);
  });

  it('discards non-string entries', () => {
    expect(normalizeGuests(['Dave', null, 42, '  ', 'Mike'])).toEqual(['Dave', 'Mike']);
  });
});
