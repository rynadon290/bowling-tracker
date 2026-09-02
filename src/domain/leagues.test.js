import { describe, it, expect } from 'vitest';
import { renameLeagueInRecords } from './leagues.js';

describe('renameLeagueInRecords', () => {
  it('renames every record matching the old league name', () => {
    const records = [
      { league: 'Tuesday House Shot', x: 1 },
      { league: 'Thursday House Shot', x: 2 },
      { league: 'Tuesday House Shot', x: 3 },
    ];
    const renamed = renameLeagueInRecords(records, 'Tuesday House Shot', 'Tuesday Night League');
    expect(renamed.filter(r => r.league === 'Tuesday Night League')).toHaveLength(2);
  });

  it('leaves records for other leagues untouched', () => {
    const records = [{ league: 'Thursday House Shot', x: 2 }];
    const renamed = renameLeagueInRecords(records, 'Tuesday House Shot', 'Tuesday Night League');
    expect(renamed[0].league).toBe('Thursday House Shot');
  });

  it('does not mutate the original array', () => {
    const records = [{ league: 'Tuesday House Shot', x: 1 }];
    renameLeagueInRecords(records, 'Tuesday House Shot', 'Tuesday Night League');
    expect(records[0].league).toBe('Tuesday House Shot');
  });
});
