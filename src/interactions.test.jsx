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

// LogView takes 138 props. baseProps is generated MECHANICALLY from the
// component's own destructuring signature -- every prop gets a safe
// default (a no-op spy for anything function-shaped, an empty value
// otherwise) -- rather than hand-picked from what one test author
// thought the visible cards needed.
//
// The first version of this file covered maybe 40 of them by hand and
// crashed on the first real run: LogView calls getMatch(...)
// unconditionally once a league is chosen, and getMatch was not in the
// hand-picked list. A mechanical baseline is how a 138-prop component
// gets tested without missing the 41st one silently.
function baseProps(overrides = {}) {
  const preferences = setTrackingMode(
    applyEnvironment(defaultPreferences('league'), 'league'), 'game');
  return {
  shots: [],
  sessions: [],
  bowlers: ["Ryan"],
  footerHeight: null,
  footerRef: vi.fn(),
  teams: [],
  leagues: ["Tuesday House Shot", "Thursday House Shot"],
  activeBowler: 'Ryan',
  newBowlerName: '',
  setNewBowlerName: vi.fn(),
  arsenals: [],
  newBallName: '',
  setNewBallName: vi.fn(),
  form: {"league": "", "date": "", "result": "", "miss": [], "ballChangeReason": [], "otherLeave": []},
  setForm: vi.fn(),
  editingId: null,
  saved: false,
  sessionSaved: false,
  sessionSaveMessage: vi.fn(),
  sessionLeague: '',
  setSessionLeague: vi.fn(),
  effectiveSessionLeague: '',
  sessionDate: '2026-09-08',
  setSessionDate: vi.fn(),
  startingLane: '',
  setStartingLane: vi.fn(),
  setShowSummary: vi.fn(),
  expandedSections: {"tonightSession": true, "manualScores": true},
  ballNumLabel: '',
  curSession: null,
  currentLane: null,
  firstBallPins: null,
  g1score: null,
  g2score: null,
  g3score: null,
  hasLeave: false,
  inTenth: false,
  isNoTap: false,
  isStrike: false,
  needsSpareMade: false,
  sessionTotal: null,
  showPinCount: false,
  standingPins: null,
  tenthOptions: [],
  addBall: vi.fn(),
  addBowler: vi.fn(),
  autoFillLine: vi.fn(),
  calcLane: vi.fn(),
  cancelEdit: vi.fn(),
  cycleGameResult: vi.fn(),
  cycleSeriesResult: vi.fn(),
  getLanePattern: vi.fn(),
  getMatch: vi.fn(),
  handleBallChange: vi.fn(),
  handleLeaveToggle: vi.fn(),
  handleLineChange: vi.fn(),
  handleSpareMadeToggle: vi.fn(),
  matchHandicap: vi.fn(),
  previousShotBall: vi.fn(),
  removeBall: vi.fn(),
  removeBowler: vi.fn(),
  selectBowler: vi.fn(),
  set: vi.fn(),
  setLanePattern: vi.fn(),
  setMatchHandicap: vi.fn(),
  setMatchOpponent: vi.fn(),
  setPokerWinnings: vi.fn(),
  setThreeSixNineWinnings: vi.fn(),
  winningsSaved: false,
  confirmWinningsSaved: vi.fn(),
  setView: vi.fn(),
  stepPinCount: vi.fn(),
  submitSession: vi.fn(),
  submitShot: vi.fn(),
  theoreticalScoreForGame: vi.fn(),
  toggle: vi.fn(),
  toggleMulti: vi.fn(),
  toggleSection: vi.fn(),
  setSessionMoneyArray: vi.fn(),
  setSessionMoneyValue: vi.fn(),
  activeBowlerLeftHanded: false,
  ballLayouts: {},
  setBallLayout: vi.fn(),
  activeTournament: null,
  updateTournament: vi.fn(),
  saveTournament: vi.fn(),
  tournamentSaved: false,
  manualScores: {},
  updateManualScore: vi.fn(),
  showSessionStart: false,
  dismissSessionStart: vi.fn(),
  updatePreferences: vi.fn(),
  sessionEnvChosen: true,
  onSessionEnvChosen: vi.fn(),
  routineNote: '',
  goalsPanel: vi.fn(),
  practiceMode: 'games',
  setPracticeMode: vi.fn(),
  gameEquipment: {},
  updateGameEquipment: vi.fn(),
  practiceTracking: false,
  setPracticeTracking: vi.fn(),
  activeDrill: null,
  setActiveDrill: vi.fn(),
  startDrill: vi.fn(),
  startAnotherDrill: vi.fn(),
  saveDrill: vi.fn(),
  drillSaved: false,
  drills: [],
  leftHandedForBowler: vi.fn(),
  ownerName: 'Ryan',
  scoringForOthers: false,
  setScoringForOthers: vi.fn(),
  scoreOptions: ["Ryan"],
  guests: [],
  newGuestName: '',
  setNewGuestName: vi.fn(),
  addGuestBowler: vi.fn(),
  removeGuestBowler: vi.fn(),
  oilPatterns: [],
  submitOilPattern: vi.fn(),
  tournaments: [],
  practicePriorAverage: vi.fn(),
  envBags: [],
  selectedBagId: '',
  setSelectedBagId: vi.fn(),
  logBalls: [],
  ballSpecs: {},
  setBallSpec: vi.fn(),
  ballGroups: [],
  seedDefaultGroups: vi.fn(),
  catalogEntries: [],
  catalogAck: {},
  userId: 'u1',
  publishBallSpecs: vi.fn(),
  voteOnEntry: vi.fn(),
  acknowledgeRejection: vi.fn(),
    preferences,
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
