import { describe, it, expect } from 'vitest';
import { HELP, searchHelp, helpByArea } from './help.js';

// Help that navigates. A bowler searching "buy-in" doesn't want an
// article, they want the money card on the Bowl tab -- so every entry
// that lives somewhere carries the view it belongs to.
describe('help content', () => {
  // A jump target that isn't a real view sends the app to the
  // unknown-view guard, which silently bounces to the Bowl tab. That's
  // how the tour's Stats step broke: it said "stats", the real id is
  // "data", and nothing errored.
  it('only points at views that exist', () => {
    const VIEWS = ['log', 'history', 'data', 'insights', 'locker',
                   'profile', 'settings', 'inbox', 'social', 'coaching', 'import'];
    for (const entry of HELP) {
      if (entry.view !== null) expect(VIEWS).toContain(entry.view);
    }
  });

  it('gives every entry a title, body and id', () => {
    for (const e of HELP) {
      expect(e.id).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(e.body).toBeTruthy();
    }
  });

  it('has no duplicate ids', () => {
    const ids = HELP.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('groups every entry into an area', () => {
    const grouped = helpByArea().flatMap(a => a.entries).length;
    expect(grouped).toBe(HELP.length);
  });
});

describe('searchHelp', () => {
  // The words a bowler would actually type, not the words the docs use.
  const expectations = [
    ['buy in', 'money-games'],
    ['poker', 'money-games'],
    ['prebowl', 'prebowl'],
    ['delete a shot', 'delete-shot'],
    ['import photo', 'import-scorecard'],
    ['compare', 'compare'],
    ['goal', 'goals'],
    ['offline', 'sync'],
    ['arsenal', 'arsenal'],
    ['roster', 'teams'],
  ];

  for (const [query, expectedId] of expectations) {
    it(`"${query}" finds ${expectedId}`, () => {
      expect(searchHelp(query)[0]?.id).toBe(expectedId);
    });
  }

  it('returns nothing for an empty query rather than everything', () => {
    expect(searchHelp('')).toEqual([]);
    expect(searchHelp('   ')).toEqual([]);
  });

  it('returns nothing for nonsense', () => {
    expect(searchHelp('zzzqqqxyz')).toEqual([]);
  });

  it('ignores case and punctuation', () => {
    expect(searchHelp('BUY-IN')[0].id).toBe('money-games');
    expect(searchHelp('buy in!!')[0].id).toBe('money-games');
  });

  // A title match should outrank a passing mention in someone's body.
  it('ranks a title match above a body mention', () => {
    const results = searchHelp('scoresheet');
    expect(results[0].id).toBe('scoresheet');
  });
});
