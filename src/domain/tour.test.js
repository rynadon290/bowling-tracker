import { describe, it, expect } from 'vitest';
import {
  tourSteps, tourLength, stepAt, isLastStep,
  tourToOffer, markTourSeen, hasSeenTour, needsLeagueSetup,
  availableTours, COACH_STEPS,
  recordStepsSeen,
  pendingModeTour,
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
    const NAV = ['log', 'history', 'data', 'insights', 'locker', 'coaching', 'social'];
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

  // Casual is the shortest -- that's the claim worth pinning. Practice
  // and league are now the same length by coincidence, since practice
  // gained its own drill steps while skipping the roster and money ones.
  // Asserting an order between THOSE two was pinning an accident.
  it('gives casual much the shortest tour', () => {
    for (const prefs of [practice, league, tournament]) {
      expect(tourLength(casual)).toBeLessThan(tourLength(prefs));
    }
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
    // Changed deliberately: a league with no team is now READY to log
    // scores. Requiring a team here was the wall 62% of new league
    // bowlers hit, and 11 of 31 abandoned at. The team is asked for
    // after a night, by domain/teamPrompt.js.
    expect(needsLeagueSetup({ environment: 'league', leagues: L, teams: [] })).toBe(false);
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

// A league bowler who did the casual tour first shouldn't sit through
// "this is the History tab" again -- the overlap between tracks is large.
describe('skipping steps already seen', () => {
  const casual = { environment: 'casual', trackingMode: 'game' };
  const league = { environment: 'league', trackingMode: 'shot', showMoneyGames: true };

  it('drops steps shown in an earlier tour', () => {
    const seen = recordStepsSeen([], tourSteps(casual));
    const next = tourSteps(league, { skipSeen: seen }).map(s => s.id);
    expect(next).not.toContain('history');
    expect(next).not.toContain('stats');
    expect(next).toContain('roster');
    expect(next).toContain('score-spare');
  });

  it('never returns an empty tour', () => {
    const seen = recordStepsSeen([], tourSteps(league));
    expect(tourSteps(league, { skipSeen: seen }).length).toBeGreaterThan(0);
  });

  it('records without duplicating', () => {
    const once = recordStepsSeen([], tourSteps(casual));
    expect(recordStepsSeen(once, tourSteps(casual))).toHaveLength(once.length);
  });
});

// A casual night has no printed scorecard, and the import flow asks
// "which team?" which a casual bowler doesn't have.
describe('import step scoping', () => {
  it('is hidden from the casual tour', () => {
    expect(tourSteps({ environment: 'casual', trackingMode: 'game' }).map(s => s.id))
      .not.toContain('import');
  });

  it('is shown to everyone else', () => {
    for (const env of ['practice', 'league', 'tournament']) {
      expect(tourSteps({ environment: env, trackingMode: 'shot' }).map(s => s.id))
        .toContain('import');
    }
  });
});

// The coach tour is about coaching, not a relabelled bowler tour.
describe('coach tour content', () => {
  it('covers the coaching workflow', () => {
    const ids = COACH_STEPS.map(s => s.id);
    for (const id of ['coach-roster', 'coach-tasks', 'coach-goals', 'coach-session']) {
      expect(ids).toContain(id);
    }
  });

  it('shares no steps with any bowler tour', () => {
    const bowlerIds = new Set(
      ['casual', 'practice', 'league', 'tournament']
        .flatMap(e => tourSteps({ environment: e, trackingMode: 'shot', showMoneyGames: true }).map(s => s.id))
    );
    for (const s of COACH_STEPS) expect(bowlerIds.has(s.id)).toBe(false);
  });
});

// Practice and tournament used to be the league tour with steps removed
// -- nothing described what either mode actually does differently, which
// is the whole reason someone picks it.
describe('mode-specific content', () => {
  const ids = env => tourSteps({
    environment: env, trackingMode: 'shot', showMoneyGames: env !== 'casual',
  }).map(s => s.id);

  it('teaches practice its own features', () => {
    const p = ids('practice');
    for (const id of ['practice-modes', 'practice-drill', 'practice-goals', 'practice-fields']) {
      expect(p).toContain(id);
    }
  });

  it('teaches tournament its own features', () => {
    const t = ids('tournament');
    for (const id of ['tourney-setup', 'tourney-cut', 'tourney-pots', 'tourney-match']) {
      expect(t).toContain(id);
    }
  });

  // A league bowler shouldn't be told about cut lines and drills, and a
  // practice bowler shouldn't get match play.
  it('keeps mode-specific steps out of other tours', () => {
    for (const env of ['casual', 'league']) {
      const list = ids(env);
      expect(list.some(id => id.startsWith('practice-'))).toBe(false);
      expect(list.some(id => id.startsWith('tourney-'))).toBe(false);
    }
    expect(ids('practice').some(id => id.startsWith('tourney-'))).toBe(false);
    expect(ids('tournament').some(id => id.startsWith('practice-'))).toBe(false);
  });

  it('gives every mode more than the casual minimum', () => {
    expect(ids('practice').length).toBeGreaterThan(ids('casual').length);
    expect(ids('tournament').length).toBeGreaterThan(ids('casual').length);
  });
});

// Split into a general tour everyone gets and short mode tours offered
// through the inbox. Stacking both onto signup made it twenty screens
// long, which is where people close the app.
describe('general vs mode tours', () => {
  const league = { environment: 'league', trackingMode: 'shot', showMoneyGames: true };
  const ids = (prefs, track) => tourSteps(prefs, { track }).map(s => s.id);

  it('puts the basics in the general tour', () => {
    const g = ids(league, 'general');
    for (const id of ['bowl', 'tracking', 'shot-detail', 'scoresheet', 'score-strike', 'stats']) {
      expect(g).toContain(id);
    }
  });

  it('keeps mode tours short and mode-specific', () => {
    for (const [env, expected] of [
      ['practice', ['practice-modes', 'practice-drill', 'practice-goals', 'practice-fields']],
      ['league', ['vault', 'roster', 'money']],
      ['tournament', ['tourney-setup', 'tourney-cut', 'tourney-pots', 'tourney-match']],
    ]) {
      const m = ids({ ...league, environment: env }, env);
      for (const id of expected) expect(m).toContain(id);
      expect(m.length).toBeLessThan(8);
    }
  });

  // The whole point of the split: no step appears in both.
  it('never repeats a general step inside a mode tour', () => {
    const g = new Set(ids(league, 'general'));
    for (const env of ['practice', 'league', 'tournament']) {
      for (const id of ids({ ...league, environment: env }, env)) {
        expect(g.has(id)).toBe(false);
      }
    }
  });
});

describe('pendingModeTour', () => {
  it('offers the mode tour once', () => {
    expect(pendingModeTour({ environment: 'tournament', seen: [] })?.key).toBe('tournament');
    expect(pendingModeTour({ environment: 'tournament', seen: ['tournament'] })).toBeNull();
  });

  // No casual-only features to explain, and a casual bowler is the least
  // likely to want more onboarding.
  it('offers nothing for casual', () => {
    expect(pendingModeTour({ environment: 'casual', seen: [] })).toBeNull();
  });

  it('describes what the tour covers', () => {
    for (const env of ['practice', 'league', 'tournament']) {
      const t = pendingModeTour({ environment: env, seen: [] });
      expect(t.label).toBeTruthy();
      expect(t.detail).toBeTruthy();
    }
  });
});

// The container leagues are not real leagues, so a bowler whose only
// "league" is Practice or Just Bowling still needs setup.
//
// This filtered on "Casual" — the container's OLD name — so it had
// silently stopped excluding it. Harmless only because the team check
// caught the same case; it would have bitten the moment a team were
// attached to the container.
describe('needsLeagueSetup and container leagues', () => {
  const ask = (leagues, teams = []) =>
    needsLeagueSetup({ environment: 'league', leagues, teams });

  it('still needs setup when only containers exist', () => {
    expect(ask(['Practice'])).toBe(true);
    expect(ask(['Just Bowling'])).toBe(true);
    expect(ask(['Practice', 'Just Bowling'])).toBe(true);
  });

  it('is not satisfied by a team attached to a container', () => {
    expect(ask(['Just Bowling'], [{ id: 't', league: 'Just Bowling' }])).toBe(true);
  });

  it('is satisfied by a real league with a team', () => {
    expect(ask(['Tuesday'], [{ id: 't', league: 'Tuesday' }])).toBe(false);
  });

  it('only applies to league mode', () => {
    for (const environment of ['casual', 'practice', 'tournament']) {
      expect(needsLeagueSetup({ environment, leagues: [], teams: [] })).toBe(false);
    }
  });
});
