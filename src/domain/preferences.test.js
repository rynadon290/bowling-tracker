import { describe, it, expect } from 'vitest';
import {
  defaultPreferences, normalizePreferences, applyEnvironment,
  resetToEnvironmentDefaults, setTrackedField, setShowMoneyGames,
  STATS_CARD_IDS, MOVABLE_STATS_CARD_IDS, reconcileCardOrder, setTrackingMode, moveStatsCard, toggleStatsCardHidden, visibleStatsCardOrder,
  setCoachView,
  coachViewActive

} from './preferences.js';

describe('defaultPreferences', () => {
  it('defaults to league if no environment given', () => {
    expect(defaultPreferences().environment).toBe('league');
  });

  it('defaults new users to scores-only tracking', () => {
    // Shot-by-shot is ~30 taps a game. Recreational bowlers bounced off it
    // before finding the features they'd pay for, so it's opt-in.
    expect(defaultPreferences('league').trackingMode).toBe('game');
  });

  it('opens Practice in shot-by-shot, because that is where its fields live', () => {
    // Practice enables surface, line, release, miss and ball speed -- all
    // of which render inside the shot form. Scores-only there would turn
    // every one of them on and then show none of them.
    expect(defaultPreferences('practice').trackingMode).toBe('shot');
    expect(applyEnvironment(defaultPreferences('league'), 'practice').trackingMode).toBe('shot');
  });

  it('keeps tracking mode independent of environment', () => {
    // Someone can bowl league by-game and practice shot-by-shot, so
    // switching environment must not silently reset how they log.
    // League and tournament keep whatever the bowler chose; only practice
    // and casual carry a mode of their own.
    const byGame = setTrackingMode(defaultPreferences('practice'), 'game');
    expect(applyEnvironment(byGame, 'league').trackingMode).toBe('game');
    const byShot = setTrackingMode(defaultPreferences('league'), 'shot');
    expect(applyEnvironment(byShot, 'tournament').trackingMode).toBe('shot');
  });

  it('falls back to game mode for an unrecognized stored value', () => {
    expect(normalizePreferences({ trackingMode: 'nonsense' }).trackingMode).toBe('game');
  });

  it('league starts with every accessory field off, money games shown', () => {
    const p = defaultPreferences('league');
    expect(p.trackedFields).toEqual({ surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: false, revRate: false, axisRotation: false });
    expect(p.showMoneyGames).toBe(true);
  });

  it('practice starts with every accessory field on, money games hidden', () => {
    const p = defaultPreferences('practice');
    expect(p.trackedFields).toEqual({ surface: true, line: true, release: true, miss: true, ballSpeed: true, shoes: true, revRate: false, axisRotation: false });
    expect(p.showMoneyGames).toBe(false);
  });

  it('tournament keeps logging simple but tracks shoes and hides money games', () => {
    // Shoes are ON here even though everything else is off: interchangeable
    // soles get swapped for approach conditions, which matters most at an
    // unfamiliar house. Money games are league side-pot conventions that
    // don't apply in tournament play.
    const p = defaultPreferences('tournament');
    expect(p.trackedFields).toEqual({ surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: true, revRate: false, axisRotation: false });
    expect(p.showMoneyGames).toBe(false);
  });

  it('starts with every MOVABLE stats card visible in default order', () => {
    // statsCardOrder covers only the cards a person can actually reorder.
    // Fixed cards ("Viewing", "Danger Zone") are anchored by StatsView and
    // deliberately excluded, so this is 34 of the 36 total cards.
    const p = defaultPreferences();
    expect(p.statsCardOrder).toEqual(MOVABLE_STATS_CARD_IDS);
    expect(p.hiddenStatsCards).toEqual([]);
  });

  it('excludes fixed cards from the reorderable set', () => {
    // "Viewing" is the selector that controls every card below it, so it
    // stays anchored at the top and can't be moved or hidden.
    expect(MOVABLE_STATS_CARD_IDS).not.toContain('viewing');
    expect(STATS_CARD_IDS).toContain('viewing');
    expect(STATS_CARD_IDS.length).toBe(MOVABLE_STATS_CARD_IDS.length + 1);
  });

  it('an unrecognized environment falls back to league defaults', () => {
    expect(defaultPreferences('made-up')).toEqual(defaultPreferences('league'));
  });
});

describe('normalizePreferences', () => {
  it('fills in missing tracked-field keys rather than dropping them', () => {
    const result = normalizePreferences({ environment: 'league', trackedFields: { surface: true } });
    expect(result.trackedFields).toEqual({ surface: true, line: false, release: false, miss: false, ballSpeed: false, shoes: false, revRate: false, axisRotation: false });
  });

  it('returns full defaults for null/undefined input', () => {
    expect(normalizePreferences(null)).toEqual(defaultPreferences());
    expect(normalizePreferences(undefined)).toEqual(defaultPreferences());
  });

  it('rejects an invalid environment value rather than trusting it', () => {
    const result = normalizePreferences({ environment: 'not-a-real-environment' });
    expect(result.environment).toBe('league');
  });

  it('preserves a valid, already-correct object unchanged', () => {
    const valid = defaultPreferences('tournament');
    expect(normalizePreferences(valid)).toEqual(valid);
  });
});

describe('applyEnvironment', () => {
  it('fully replaces trackedFields/showMoneyGames with the new environment\'s preset', () => {
    const startedInLeague = defaultPreferences('league');
    const customized = setTrackedField(startedInLeague, 'miss', true); // manual override
    const switched = applyEnvironment(customized, 'tournament');
    // Tournament's preset should win outright, not merge with the override.
    expect(switched.trackedFields.miss).toBe(false);
    expect(switched.environment).toBe('tournament');
  });
});

describe('resetToEnvironmentDefaults', () => {
  it('discards manual overrides and restores the current environment\'s preset', () => {
    const customized = setShowMoneyGames(setTrackedField(defaultPreferences('practice'), 'surface', false), true);
    const reset = resetToEnvironmentDefaults(customized);
    expect(reset).toEqual(defaultPreferences('practice'));
  });
});

describe('setTrackedField / setShowMoneyGames', () => {
  it('setTrackedField only touches the one field named', () => {
    const p = defaultPreferences('league');
    const updated = setTrackedField(p, 'release', true);
    expect(updated.trackedFields).toEqual({ surface: false, line: false, release: true, miss: false, ballSpeed: false, shoes: false, revRate: false, axisRotation: false });
  });

  it('setShowMoneyGames toggles independently of trackedFields', () => {
    const p = defaultPreferences('league');
    const updated = setShowMoneyGames(p, false);
    expect(updated.showMoneyGames).toBe(false);
    expect(updated.trackedFields).toEqual(p.trackedFields);
  });
});

describe('casual environment', () => {
  it('forces scores-only regardless of the previous tracking mode', () => {
    // The whole point of "Just Bowling" is to hide the depth. Carrying
    // shot-by-shot into it would defeat that.
    const shot = setTrackingMode(defaultPreferences('practice'), 'shot');
    expect(applyEnvironment(shot, 'casual').trackingMode).toBe('game');
  });

  it('hides money games and every accessory field', () => {
    const p = applyEnvironment(defaultPreferences('league'), 'casual');
    expect(p.showMoneyGames).toBe(false);
    expect(Object.values(p.trackedFields).every(v => v === false)).toBe(true);
  });
});

// The coach view is gated on two separate facts, and both have to hold.
// The suite passed without these only because nothing asserted the whole
// preferences object -- the field had no coverage at all.
describe('coach view', () => {
  it('is off by default, even before anyone is a coach', () => {
    expect(defaultPreferences('league').coachView).toBe(false);
  });

  it('survives normalizePreferences rather than being stripped', () => {
    const on = setCoachView(defaultPreferences('league'), true);
    expect(normalizePreferences(on).coachView).toBe(true);
  });

  it('requires the profile flag as well as the toggle', () => {
    const on = setCoachView(defaultPreferences('league'), true);
    expect(coachViewActive(on, { isCoach: true })).toBe(true);
    // Someone who unset the coach flag must not be stranded in coach view.
    expect(coachViewActive(on, { isCoach: false })).toBe(false);
    expect(coachViewActive(on, null)).toBe(false);
  });

  it('requires the toggle as well as the flag', () => {
    expect(coachViewActive(defaultPreferences('league'), { isCoach: true })).toBe(false);
  });
});

describe('remembering a tracking choice per environment', () => {
  it('still opens Practice in shot-by-shot for someone who never chose', () => {
    expect(applyEnvironment(defaultPreferences('league'), 'practice').trackingMode).toBe('shot');
  });

  // The bug: choosing game-score tracking in Practice, then re-selecting
  // Practice, silently reset it to shot -- so it could never stick.
  it('keeps an explicit Practice choice when Practice is selected again', () => {
    let p = applyEnvironment(defaultPreferences('league'), 'practice');
    p = setTrackingMode(p, 'game');
    p = applyEnvironment(p, 'league');
    expect(applyEnvironment(p, 'practice').trackingMode).toBe('game');
  });

  it('keeps the choice scoped to the environment it was made in', () => {
    let p = applyEnvironment(defaultPreferences('league'), 'practice');
    p = setTrackingMode(p, 'game');
    expect(p.trackingModeChoices.practice).toBe('game');
    expect(p.trackingModeChoices.league).toBeUndefined();
  });

  it('still forces casual to scores-only regardless of any choice', () => {
    let p = setTrackingMode(applyEnvironment(defaultPreferences('league'), 'casual'), 'shot');
    expect(applyEnvironment(p, 'casual').trackingMode).toBe('game');
  });

  it('survives normalize', () => {
    let p = setTrackingMode(applyEnvironment(defaultPreferences('league'), 'practice'), 'game');
    expect(normalizePreferences(p).trackingModeChoices.practice).toBe('game');
  });

  it('ignores a malformed stored choice', () => {
    expect(normalizePreferences({ trackingModeChoices: { practice: 'nonsense', bogus: 'game' } }).trackingModeChoices).toEqual({});
  });
});
