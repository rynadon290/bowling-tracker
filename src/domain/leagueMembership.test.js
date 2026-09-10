import { describe, it, expect } from 'vitest';
import { isContainerLeague, visibleLeagues } from './leagueMembership.js';

// Practice and Just Bowling are containers, not leagues. They exist so
// scores have somewhere to hang -- nobody joins them, they have no team,
// and they can't be renamed or deleted. Offering to add a team to
// "Practice" is offering something that can't work.
describe('container leagues', () => {
  it('recognises both containers', () => {
    expect(isContainerLeague('Practice')).toBe(true);
    expect(isContainerLeague('Just Bowling')).toBe(true);
  });

  it('leaves real leagues alone', () => {
    expect(isContainerLeague('Tuesday House Shot')).toBe(false);
    expect(isContainerLeague('')).toBe(false);
    expect(isContainerLeague(undefined)).toBe(false);
  });

  it('keeps them out of the visible league list', () => {
    expect(visibleLeagues(['Practice', 'Just Bowling', 'Tuesday House Shot'], [], {}))
      .toEqual(['Tuesday House Shot']);
  });

  // Filtered by NAME, not by hidden id: the id only exists once the
  // cloud row is created, so an offline bowler -- or one on their first
  // ever practice -- would otherwise see "Practice" in the Vault.
  it('hides them even before their cloud row exists', () => {
    expect(visibleLeagues(['Practice', 'Tuesday House Shot'], [], {})).toEqual(['Tuesday House Shot']);
  });

  it('still honours hidden ids for real leagues', () => {
    expect(visibleLeagues(['Tuesday House Shot', 'Old League'], ['old'], { 'Old League': 'old' }))
      .toEqual(['Tuesday House Shot']);
  });
});
