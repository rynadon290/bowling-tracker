import { describe, it, expect } from 'vitest';
import {
  emptyCenter, normalizeCenter, centerLabel, distanceMiles, centerKey,
  findExistingCenter, statsByCenter, centerToRow, centerFromRow,
} from './centers.js';

// Shape taken from a real HERE Discover response.
const arsenal = {
  hereId: 'here:pds:place:840dppnh-42987a39b8963d2647a58aa1fc82a571',
  name: 'Arsenal Bowl',
  address: 'Arsenal Bowl, 4104 Butler St, Pittsburgh, PA 15201-3122, United States',
  city: 'Pittsburgh', state: 'PA', postalCode: '15201-3122', country: 'USA',
  lat: 40.46954, lng: -79.96106,
};

describe('normalizeCenter', () => {
  it('handles a real HERE result', () => {
    const c = normalizeCenter(arsenal);
    expect(c.name).toBe('Arsenal Bowl');
    expect(c.lat).toBe(40.46954);
  });

  it('returns a complete center for missing input', () => {
    expect(normalizeCenter(null)).toEqual(emptyCenter());
  });
});

describe('centerLabel', () => {
  it('includes city and state when known', () => {
    expect(centerLabel(normalizeCenter(arsenal))).toBe('Arsenal Bowl · Pittsburgh, PA');
  });

  it('falls back to the name alone for a hand-entered center', () => {
    expect(centerLabel({ name: 'Small House' })).toBe('Small House');
  });
});

describe('deduplication', () => {
  const existing = [
    { id: 'c1', ...arsenal },
    { id: 'c2', hereId: null, name: 'Small House', city: 'Millvale' },
  ];

  it('matches on HERE id when both sides have one', () => {
    expect(findExistingCenter(arsenal, existing).id).toBe('c1');
  });

  it('matches a hand-entered center on name and city, ignoring case and spacing', () => {
    // Without this, one house splits into two and its stats fragment.
    expect(findExistingCenter({ name: '  small   HOUSE ', city: 'millvale' }, existing).id).toBe('c2');
  });

  it('treats the same name in a different city as a different house', () => {
    expect(findExistingCenter({ name: 'Small House', city: 'Erie' }, existing)).toBeNull();
  });
});

describe('distanceMiles', () => {
  it('converts metres to miles', () => {
    expect(distanceMiles(4364)).toBe(2.7);
  });

  it('returns null when the search was not location-anchored', () => {
    expect(distanceMiles(null)).toBeNull();
  });
});

describe('statsByCenter', () => {
  const leagues = [
    { name: 'Thursday House Shot', centerId: 'c1' },
    { name: 'Tuesday House Shot', centerId: 'c2' },
    { name: 'No Center League' },
  ];
  const centers = [
    { id: 'c1', name: 'Arsenal Bowl', city: 'Pittsburgh', state: 'PA' },
    { id: 'c2', name: 'Small House', city: 'Millvale' },
  ];
  const sessions = [
    { bowler: 'Ryan', league: 'Thursday House Shot', scores: [200, 210, 220] },
    { bowler: 'Ryan', league: 'Thursday House Shot', scores: [190, 200, 180] },
    { bowler: 'Ryan', league: 'Tuesday House Shot', scores: [170, 160, 180] },
    { bowler: 'Ryan', league: 'No Center League', scores: [300, 300, 300] },
    { bowler: 'Aaron', league: 'Thursday House Shot', scores: [100, 100, 100] },
  ];

  it('averages a bowler by house, best first', () => {
    const out = statsByCenter(sessions, leagues, centers, 'Ryan');
    expect(out.map(s => s.center.name)).toEqual(['Arsenal Bowl', 'Small House']);
    expect(out[0].average).toBe(200);
    expect(out[1].average).toBe(170);
  });

  it('excludes leagues with no center rather than inventing a bucket', () => {
    // Those 300s would otherwise show up as an "unknown house" with a
    // meaningless average.
    const out = statsByCenter(sessions, leagues, centers, 'Ryan');
    expect(out.some(s => s.average === 300)).toBe(false);
  });

  it('scopes to the requested bowler', () => {
    expect(statsByCenter(sessions, leagues, centers, 'Aaron')[0].average).toBe(100);
  });

  it('tolerates empty inputs', () => {
    expect(statsByCenter(null, null, null, 'Ryan')).toEqual([]);
  });
});

describe('supabase round trip', () => {
  it('preserves the HERE id and coordinates', () => {
    const back = centerFromRow(centerToRow({ id: 'c1', ...arsenal }, 'u1'));
    expect(back.hereId).toBe(arsenal.hereId);
    expect([back.lat, back.lng]).toEqual([40.46954, -79.96106]);
  });
});
