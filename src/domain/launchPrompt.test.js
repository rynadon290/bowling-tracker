import { describe, it, expect } from 'vitest';
import {
  parseLocalDate, weekdayOf, usualNights, shouldShowLaunchPrompt, describeUsualNights,
} from './launchPrompt.js';

// Tuesdays in June 2026: 2, 9, 16, 23, 30
const TUESDAYS = ['2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23'];
const TUE = new Date(2026, 5, 30);   // Tue 30 Jun 2026
const SAT = new Date(2026, 6, 4);    // Sat 4 Jul 2026
const sessions = TUESDAYS.map(d => ({ bowler: 'Ryan', date: d, league: 'Tuesday House Shot' }));

describe('local date parsing', () => {
  // The bug this guards against: new Date("2026-03-01") is UTC midnight,
  // which is the previous day in any negative-offset timezone, shifting
  // every session onto the wrong weekday.
  it('parses date strings as local, not UTC', () => {
    expect(weekdayOf('2026-03-01')).toBe(new Date(2026, 2, 1).getDay());
  });

  it('rejects dates that roll over into the next month', () => {
    expect(parseLocalDate('2026-02-31')).toBeNull();
  });

  it('rejects malformed and non-string input', () => {
    expect(parseLocalDate('2026-3-1')).toBeNull();
    expect(parseLocalDate('nope')).toBeNull();
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
  });
});

describe('deriving usual bowling nights', () => {
  it('treats a repeated weekday as usual once the threshold is met', () => {
    expect(usualNights(sessions.slice(0, 2), 'Ryan', TUE).size).toBe(0);
    expect(usualNights(sessions.slice(0, 3), 'Ryan', TUE).has(2)).toBe(true);
  });

  it('counts distinct dates, so one heavily-logged night is not a pattern', () => {
    const sameDay = [1, 2, 3, 4, 5].map(() => ({ bowler: 'Ryan', date: '2026-06-02' }));
    expect(usualNights(sameDay, 'Ryan', TUE).size).toBe(0);
  });

  it('ignores other bowlers on a shared device', () => {
    const mixed = [
      ...sessions,
      ...['2026-06-06', '2026-06-13', '2026-06-20'].map(d => ({ bowler: 'Sam', date: d })),
    ];
    const mine = usualNights(mixed, 'Ryan', TUE);
    expect(mine.has(2)).toBe(true);
    expect(mine.has(6)).toBe(false);
  });

  it('ignores sessions outside the lookback window and in the future', () => {
    const old = ['2025-01-07', '2025-01-14', '2025-01-21'].map(d => ({ bowler: 'Ryan', date: d }));
    expect(usualNights(old, 'Ryan', TUE).size).toBe(0);
    expect(usualNights([{ bowler: 'Ryan', date: '2027-01-05' }], 'Ryan', TUE).size).toBe(0);
  });

  it('survives null and malformed session entries', () => {
    expect(usualNights(null, 'Ryan', TUE).size).toBe(0);
    expect(usualNights([null, undefined, { date: null }], 'Ryan', TUE).size).toBe(0);
  });
});

describe('when the prompt should appear', () => {
  it('shows on a first ever launch so the setting is discoverable', () => {
    expect(shouldShowLaunchPrompt({ sessions: [], bowler: 'Ryan', seenOnce: false, dismissedDate: '', today: TUE })).toBe(true);
  });

  it('stays hidden for the rest of a day once dismissed', () => {
    expect(shouldShowLaunchPrompt({ sessions: [], bowler: 'Ryan', seenOnce: false, dismissedDate: '2026-06-30', today: TUE })).toBe(false);
  });

  it('goes quiet on an established bowling night', () => {
    expect(shouldShowLaunchPrompt({ sessions, bowler: 'Ryan', seenOnce: true, dismissedDate: '', today: TUE })).toBe(false);
  });

  it('still asks on a day that is not a usual night', () => {
    expect(shouldShowLaunchPrompt({ sessions, bowler: 'Ryan', seenOnce: true, dismissedDate: '', today: SAT })).toBe(true);
  });

  it('falls back to once-a-day when there is no established pattern', () => {
    expect(shouldShowLaunchPrompt({ sessions: [], bowler: 'Ryan', seenOnce: true, dismissedDate: '', today: TUE })).toBe(true);
  });

  it('reappears the day after being dismissed', () => {
    expect(shouldShowLaunchPrompt({ sessions: [], bowler: 'Ryan', seenOnce: true, dismissedDate: '2026-06-29', today: TUE })).toBe(true);
  });

  it('does not throw when called with no arguments', () => {
    expect(typeof shouldShowLaunchPrompt()).toBe('boolean');
  });
});

describe('explaining the behaviour in Settings', () => {
  it('names a single usual night', () => {
    expect(describeUsualNights(sessions, 'Ryan', TUE)).toContain('Tuesday');
  });

  it('says so plainly when there is not enough history', () => {
    expect(describeUsualNights([], 'Ryan', TUE)).toContain('Not enough history');
  });

  it('uses an Oxford comma for three or more nights', () => {
    const many = [
      ...sessions,
      ...['2026-06-04', '2026-06-11', '2026-06-18'].map(d => ({ bowler: 'Ryan', date: d })),
      ...['2026-06-06', '2026-06-13', '2026-06-20'].map(d => ({ bowler: 'Ryan', date: d })),
    ];
    expect(describeUsualNights(many, 'Ryan', TUE)).toContain(', and');
  });
});
