import { describe, it, expect } from 'vitest';
import {
  tourSteps, tourLength, stepAt, isLastStep,
  tourToOffer, markTourSeen, hasSeenTour, needsLeagueSetup,
  availableTours, COACH_STEPS,
} from './tour.js';

const league = { environment: 'league', trackingMode: 'shot', showMoneyGames: true };
const casual = { environment: 'casual', trackingMode: 'game', showMoneyGames: false };
const practice = { environment: 'practice', trackingMode: 'shot', showMoneyGames: false };
const tournament = { environment: 'tournament', trackingMode: 'shot', showMoneyGames: true };

const ids = prefs => tourSteps(prefs).map(s => s.id);

// One tour per way of bowling. A casual bowler with friends doesn't need
// a league roster explained, and showing it makes the app look like more
// work than it is -- which is the moment a casual bowler decides it
// isn't for them.
describe('tourSteps by environment', () => {
  // Every tab a step names must be a REAL nav id. The Stats step once
  // said "stats" when the id is "data"; an unknown view hits the guard in
  // BowlingTracker and silently bounces to Bowl.
  it('only names tabs that exist in the nav', () => {
    const NAV = ['log', 'history', 'data', 'insights', 'locker', 'coaching'];
    for (const prefs of [league, casual, practice, tournament]) {
      for (const s of tourSteps(prefs)) if (s.tab) expect(NAV).toContain(s.tab);
    }
    for (const s of COACH_STEPS) if (s.tab) expect(NAV).toContain(s.tab);
  });

  it('starts on Bowl for every environment', () => {
    for (const prefs of [league, casual, practice, tournament]) {
      expect(ids(prefs)[0]).toBe('bowl');
    }
  });

  it('gives casual the shortest tour', () => {
    expect(tourLength(casual)).toBeLessThan(tourLength(practice));
    expect(tourLength(practice)).toBeLessThan(tourLength(league));
  });

  // A casual bowler is on a house ball; a league roster means nothing
  // to them; a goal against a night with friends isn't meaningful.
  it('spares a casual bowler the league, arsenal and goals steps', () => {
    const c = ids(casual);
    expect(c).not.toContain('roster');
    expect(c).not.toContain('vault');
    expect(c).not.toContain('arsenal');
    expect(c).not.toContain('money');
    expect(c).not.toContain('improve');
    expect(c).not.toContain('scoresheet');
  });

  it('shows everyone else their arsenal and bags', () => {
    expect(ids(practice)).toContain('arsenal');
    expect(ids(league)).toContain('arsenal');
    expect(ids(tournament)).toContain('arsenal');
  });

  it('shows the roster step to league only', () => {
    expect(ids(league)).toContain('roster');
    expect(ids(tournament)).not.toContain('roster');
    expect(ids(practice)).not.toContain('roster');
  });

  it('shows insights to everyone', () => {
    for (const prefs of [league, casual, practice, tournament]) {
      expect(ids(prefs)).toContain('insights');
    }
  });

  it('includes the three scoring lessons only when tracking shot by shot', () => {
    for (const id of ['score-strike', 'score-spare', 'score-miss']) {
      expect(ids(league)).toContain(id);
      expect(ids(casual)).not.toContain(id);
    }
  });

  it('gives every step a title and body', () => {
    for (const prefs of [league, casual, practice, tournament]) {
      for (const s of tourSteps(prefs)) {
        expect(s.title).toBeTruthy();
        expect(s.body).toBeTruthy();
      }
    }
  });

  it('defaults to league with no preferences', () => {
    expect(tourSteps({}).length).toBeGreaterThan(0);
    expect(tourSteps(undefined).length).toBeGreaterThan(0);
  });
});

describe('coach track', () => {
  it('is a separate walkthrough about the coach view', () => {
    const c = tourSteps({}, { track: 'coach' });
    expect(c).toBe(COACH_STEPS);
    expect(c.every(s => s.tab === 'coaching')).toBe(true);
  });

  it('is not mixed into any bowler tour', () => {
    for (const prefs of [league, casual, practice, tournament]) {
      expect(ids(prefs).some(id => id.startsWith('coach-'))).toBe(false);
    }
  });
});

describe('stepAt', () => {
  // Clamped, not wrapped: running off the end should stop, not send a
  // new bowler back to step one.
  it('clamps rather than wrapping', () => {
    expect(stepAt(league, -5).id).toBe('bowl');
    expect(stepAt(league, 999).id).toBe(ids(league).at(-1));
  });

  it('knows when it is on the last step', () => {
    expect(isLastStep(league, tourLength(league) - 1)).toBe(true);
    expect(isLastStep(league, 0)).toBe(false);
    expect(isLastStep(league, 999)).toBe(true);
  });
});

// The tour is per environment. Someone who signed up casual and comes
// back for a league shouldn't have to find the league features alone --
// but shouldn't sit through the casual tour again either.
describe('tourToOffer', () => {
  it('offers the tour for an environment not yet seen', () => {
    expect(tourToOffer({ environment: 'casual', seen: [] })).toBe('casual');
    expect(tourToOffer({ environment: 'league', seen: ['casual'] })).toBe('league');
  });

  it('offers nothing for one already seen', () => {
    expect(tourToOffer({ environment: 'casual', seen: ['casual'] })).toBeNull();
  });

  it('offers the coach tour when coach mode is on', () => {
    expect(tourToOffer({ environment: 'league', isCoach: true, seen: ['league'] })).toBe('coach');
    expect(tourToOffer({ environment: 'league', isCoach: true, seen: ['league', 'coach'] })).toBeNull();
  });

  it('records a tour as seen without duplicating', () => {
    let seen = markTourSeen([], 'casual');
    seen = markTourSeen(seen, 'casual');
    expect(seen).toEqual(['casual']);
    expect(hasSeenTour(seen, 'casual')).toBe(true);
    expect(hasSeenTour(seen, 'league')).toBe(false);
  });

  it('tolerates bad stored data', () => {
    expect(hasSeenTour('nope', 'casual')).toBe(false);
    expect(markTourSeen(null, 'casual')).toEqual(['casual']);
  });
});

// Choosing "league" with nothing set up is a dead end: scores are filed
// against a league, so there's nowhere to put them.
describe('needsLeagueSetup', () => {
  const L = ['Tuesday House Shot'];

  it('is true with no leagues at all', () => {
    expect(needsLeagueSetup({ environment: 'league', leagues: [], teams: [] })).toBe(true);
  });

  it('is true with a league but no team in it', () => {
    expect(needsLeagueSetup({ environment: 'league', leagues: L, teams: [] })).toBe(true);
  });

  it('is false once a team exists for a league', () => {
    expect(needsLeagueSetup({ environment: 'league', leagues: L, teams: [{ league: 'Tuesday House Shot' }] })).toBe(false);
  });

  // Practice and Casual are container leagues, not real ones.
  it('does not count Practice or Casual as a league', () => {
    expect(needsLeagueSetup({ environment: 'league', leagues: ['Practice', 'Casual'], teams: [] })).toBe(true);
  });

  it('never applies outside league mode', () => {
    for (const env of ['casual', 'practice', 'tournament']) {
      expect(needsLeagueSetup({ environment: env, leagues: [], teams: [] })).toBe(false);
    }
  });
});

// Every walkthrough is replayable from Settings. Coaching is gated:
// offering it to everyone would advertise a mode most people never use.
describe('availableTours', () => {
  it('hides the coach tour from non-coaches', () => {
    expect(availableTours(false).map(t => t.key)).not.toContain('coach');
  });

  it('shows the coach tour to coaches', () => {
    expect(availableTours(true).map(t => t.key)).toContain('coach');
  });

  it('always offers the four bowling tours', () => {
    const keys = availableTours(false).map(t => t.key);
    for (const k of ['casual', 'practice', 'league', 'tournament']) expect(keys).toContain(k);
  });

  it('gives every track a label and blurb', () => {
    for (const t of availableTours(true)) {
      expect(t.label).toBeTruthy();
      expect(t.blurb).toBeTruthy();
    }
  });
});
