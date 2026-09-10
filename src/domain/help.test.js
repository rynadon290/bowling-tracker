import { describe, it, expect } from 'vitest';
import { CASUAL_BADGES } from './casualBadges.js';
import { HELP, searchHelp, helpByArea,
  helpFor,
} from './help.js';

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

// A Just Bowling user's docs should describe THEIR app. Returning
// articles about rosters and money games to someone whose app has
// neither implies they've lost features, or that search is broken.
describe('helpFor', () => {
  const casual = helpFor('casual');

  it('gives a casual bowler a much shorter set', () => {
    expect(casual.length).toBeLessThan(HELP.length / 2);
  });

  it('keeps everything for other modes', () => {
    for (const env of ['league', 'practice', 'tournament', undefined]) {
      expect(helpFor(env)).toBe(HELP);
    }
  });

  it('hides features casual mode does not have', () => {
    const ids = casual.map(e => e.id);
    for (const id of ['teams', 'prebowl', 'money-games', 'coaching', 'signup-codes']) {
      expect(ids).not.toContain(id);
    }
  });

  // The way back for someone who picked the mode by accident and watched
  // four tabs disappear. If this isn't reachable, they're stuck.
  it('always includes the way back', () => {
    expect(casual.map(e => e.id)).toContain('everything-gone');
    expect(searchHelp('where did everything go', casual)[0].id).toBe('everything-gone');
    expect(searchHelp('missing', casual)[0].id).toBe('everything-gone');
  });

  it('finds beginner tips', () => {
    expect(searchHelp('how does scoring work', casual)[0].id).toBe('tips-scoring');
    expect(searchHelp('spare', casual)[0].id).toBe('tips-spares');
    expect(searchHelp('new to bowling', casual)[0].id).toBe('tips-basics');
  });

  it('finds the badge list', () => {
    expect(searchHelp('badges', casual)[0].id).toBe('casual-badges');
  });

  // Generated from the real badge list, so the docs cannot drift.
  it('lists every badge that actually exists', () => {
    const body = HELP.find(e => e.id === 'casual-badges').body;
    for (const b of CASUAL_BADGES) expect(body).toContain(b.name);
    expect(body).toContain(String(CASUAL_BADGES.length));
  });
});

// The mode picker is on the BOWL tab, in the "Bowling today?" card --
// not in Settings. This entry exists for someone who picked Just
// Bowling by accident and watched four tabs vanish, so sending them to
// the wrong screen strands the exact person it's meant to rescue.
describe('the way back from Just Bowling', () => {
  const entry = HELP.find(e => e.id === 'everything-gone');

  it('jumps to the Bowl tab, not Settings', () => {
    expect(entry.view).toBe('log');
  });

  it('names the card and the control', () => {
    expect(entry.body).toMatch(/Bowl tab/);
    expect(entry.body).toMatch(/Change/);
    expect(entry.body).not.toMatch(/Open Settings/);
  });

  it('reassures them nothing was deleted', () => {
    expect(entry.body).toMatch(/still there|Nothing is deleted/);
  });
});
