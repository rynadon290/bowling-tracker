import { describe, it, expect } from 'vitest';
import {
  defaultPreferences, normalizePreferences, applyEnvironment,
  resetToEnvironmentDefaults, setTrackedField, setShowMoneyGames,
  STATS_CARD_IDS, MOVABLE_STATS_CARD_IDS, reconcileCardOrder, moveStatsCard, toggleStatsCardHidden, visibleStatsCardOrder,
} from './preferences.js';

describe('defaultPreferences', () => {
  it('defaults to league if no environment given', () => {
    expect(defaultPreferences().environment).toBe('league');
  });

  it('league starts with every accessory field off, money games shown', () => {
    const p = defaultPreferences('league');
    expect(p.trackedFields).toEqual({ surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: false });
    expect(p.showMoneyGames).toBe(true);
  });

  it('practice starts with every accessory field on, money games hidden', () => {
    const p = defaultPreferences('practice');
    expect(p.trackedFields).toEqual({ surface: true, line: true, release: true, miss: true, ballSpeed: true, shoes: true });
    expect(p.showMoneyGames).toBe(false);
  });

  it('tournament keeps logging simple but tracks shoes and hides money games', () => {
    // Shoes are ON here even though everything else is off: interchangeable
    // soles get swapped for approach conditions, which matters most at an
    // unfamiliar house. Money games are league side-pot conventions that
    // don't apply in tournament play.
    const p = defaultPreferences('tournament');
    expect(p.trackedFields).toEqual({ surface: false, line: false, release: false, miss: false, ballSpeed: false, shoes: true });
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
    expect(result.trackedFields).toEqual({ surface: true, line: false, release: false, miss: false, ballSpeed: false, shoes: false });
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
    expect(updated.trackedFields).toEqual({ surface: false, line: false, release: true, miss: false, ballSpeed: false, shoes: false });
  });

  it('setShowMoneyGames toggles independently of trackedFields', () => {
    const p = defaultPreferences('league');
    const updated = setShowMoneyGames(p, false);
    expect(updated.showMoneyGames).toBe(false);
    expect(updated.trackedFields).toEqual(p.trackedFields);
  });
});
