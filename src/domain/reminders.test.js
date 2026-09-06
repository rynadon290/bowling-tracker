import { describe, it, expect } from 'vitest';
import { inferLeagueDay, normalizeReminder, isLeagueDay, reminderToIcs, reminderSpec } from './reminders.js';

describe('inferLeagueDay', () => {
  it('finds the weekday a league bowls on from its sessions', () => {
    const sessions = [
      { league: 'Thu', date: '2026-09-03' }, { league: 'Thu', date: '2026-09-10' }, { league: 'Thu', date: '2026-09-17' },
    ];
    expect(inferLeagueDay(sessions, 'Thu')).toBe(4);
  });

  it('refuses to guess without a clear majority', () => {
    // A league split across two nights must not get a reminder for the
    // wrong one -- null means "don't nag".
    const split = [
      { league: 'X', date: '2026-09-01' }, { league: 'X', date: '2026-09-03' },
      { league: 'X', date: '2026-09-08' }, { league: 'X', date: '2026-09-10' },
    ];
    expect(inferLeagueDay(split, 'X')).toBeNull();
  });

  it('needs a minimum number of sessions', () => {
    expect(inferLeagueDay([{ league: 'Y', date: '2026-09-03' }], 'Y')).toBeNull();
  });
});

describe('normalizeReminder', () => {
  it('rejects an impossible weekday', () => {
    expect(normalizeReminder({ day: 9 })).toBeNull();
  });

  it('defaults a malformed time', () => {
    expect(normalizeReminder({ day: 4, time: 'bad' }).time).toBe('19:00');
  });
});

describe('reminderToIcs', () => {
  const r = reminderSpec('Thursday House Shot', 4, 60, '19:00');

  it('recurs weekly on the right day with an alarm', () => {
    const ics = reminderToIcs(r, 'Arsenal Bowl');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TH');
    expect(ics).toContain('TRIGGER:-PT60M');
  });

  it('escapes commas in the location so the file stays valid', () => {
    expect(reminderToIcs(r, 'Bowl, Inc')).toContain('Bowl\\, Inc');
  });
});
