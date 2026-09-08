import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LogView from './LogView.jsx';
import { defaultPreferences, applyEnvironment, setTrackingMode } from './domain/preferences.js';

// Interaction tests -- the category that static checks and string
// rendering cannot reach.
//
// Every one of these exists because of a real bug that shipped. React
// swallows errors thrown inside event handlers, so a broken tap handler
// looks exactly like a working one that decided to do nothing. The only
// way to tell them apart is to click and assert.

function baseProps(overrides = {}) {
  const preferences = setTrackingMode(
    applyEnvironment(defaultPreferences('league'), 'league'), 'game');
  return {
    preferences,
    bowlers: ['Ryan'],
    activeBowler: 'Ryan',
    leagues: ['Tuesday House Shot', 'Thursday House Shot'],
    teams: [],
    shots: [],
    sessions: [],
    manualScores: {},
    gameEquipment: {},
    drills: [],
    scoreOptions: ['Ryan'],
    arsenal: [],
    sessionLeague: '',
    effectiveSessionLeague: '',
    sessionDate: '2026-09-08',
    practiceMode: 'games',
    showSessionStart: false,
    sessionEnvChosen: true,
    expandedSections: { tonightSession: true, manualScores: true },
    form: { league: '', date: '', result: '', miss: [], ballChangeReason: [], otherLeave: [] },
    // Every callback a no-op spy, so a test can assert what got called.
    setSessionLeague: vi.fn(),
    setForm: vi.fn(),
    setShowSummary: vi.fn(),
    setSessionDate: vi.fn(),
    set: vi.fn(),
    toggleSection: vi.fn(),
    onSessionEnvChosen: vi.fn(),
    submitSession: vi.fn(),
    startAnotherDrill: vi.fn(),
    updatePreferences: vi.fn(),
    dismissSessionStart: vi.fn(),
    ...overrides,
  };
}

describe('league selection', () => {
  // THE BUG: teams loaded at startup have no `members` array, so the
  // chip's handler called (undefined).includes() and threw. React
  // swallowed it. The chip appeared to do nothing, and no test caught it
  // because rendering to a string never runs the handler.
  it('selects a league when its chip is tapped', () => {
    const setSessionLeague = vi.fn();
    render(<LogView {...baseProps({ setSessionLeague })} />);

    fireEvent.click(screen.getByText('Tuesday'));

    expect(setSessionLeague).toHaveBeenCalledWith('Tuesday House Shot');
  });

  // The exact shape that broke it: a team with no members key at all.
  it('selects a league even when teams have no members array', () => {
    const setSessionLeague = vi.fn();
    render(<LogView {...baseProps({
      setSessionLeague,
      // No `members` -- this is what the startup fetch produces.
      teams: [{ id: 't1', name: 'Split Happens', league: 'Tuesday House Shot' }],
    })} />);

    fireEvent.click(screen.getByText('Tuesday'));

    expect(setSessionLeague).toHaveBeenCalledWith('Tuesday House Shot');
  });

  it('resolves the team id when members are present', () => {
    const setForm = vi.fn();
    render(<LogView {...baseProps({
      setForm,
      teams: [{ id: 't1', name: 'Split Happens', league: 'Tuesday House Shot', members: ['Ryan'] }],
    })} />);

    fireEvent.click(screen.getByText('Tuesday'));

    // setForm is called with an updater function; run it to see the result.
    const updater = setForm.mock.calls[0][0];
    expect(updater({})).toMatchObject({ teamId: 't1', league: 'Tuesday House Shot' });
  });
});

describe('score entry gating', () => {
  // Scores are filed against (bowler, league, date). Entering one before
  // a league is chosen has nowhere to go -- it wouldn't sync and wouldn't
  // appear once a league WAS picked.
  it('does not offer score entry before a league is chosen', () => {
    render(<LogView {...baseProps({ effectiveSessionLeague: '' })} />);
    expect(screen.queryByPlaceholderText('Score')).toBeNull();
  });

  it('offers score entry once a league is chosen', () => {
    render(<LogView {...baseProps({
      sessionLeague: 'Tuesday House Shot',
      effectiveSessionLeague: 'Tuesday House Shot',
    })} />);
    expect(screen.getAllByPlaceholderText('Score').length).toBeGreaterThan(0);
  });
});
