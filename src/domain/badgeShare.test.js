import { describe, it, expect } from 'vitest';
import {
  buildSharePayload, encodeShare, decodeShare, nightsFromPayload,
  mergeSharedNights, describeImport, SHARE_VERSION,
} from './badgeShare.js';

const night = (date, scoresByBowler) => ({ date, scoresByBowler });
const THREE = [
  night('2026-09-04', { Ryan: [145, 162, 151], Dave: [130, 128, 140] }),
  night('2026-09-11', { Ryan: [168, 152, 205], Dave: [141, 150, 133] }),
];

describe('buildSharePayload', () => {
  it('carries only that bowler’s scores', () => {
    const p = buildSharePayload('Dave', THREE);
    const s = JSON.stringify(p);
    expect(s).not.toContain('145');   // Ryan's game
    expect(s).toContain('130');       // Dave's
  });

  // Sending the whole scoresheet would hand someone else's numbers to a
  // person who never asked for them.
  it('names only the bowler being shared with', () => {
    expect(buildSharePayload('Dave', THREE).n).toBe('Dave');
  });

  it('skips nights that bowler did not bowl', () => {
    const nights = [...THREE, night('2026-09-18', { Ryan: [200, 200, 200] })];
    expect(buildSharePayload('Dave', nights).d).toHaveLength(2);
  });

  it('refuses an impossible score rather than sending it', () => {
    const p = buildSharePayload('Ryan', [night('2026-09-04', { Ryan: [3000, 180, -5] })]);
    expect(JSON.stringify(p)).not.toContain('3000');
    expect(JSON.stringify(p)).toContain('180');
  });

  it('returns null when there is nothing to share', () => {
    expect(buildSharePayload('Nobody', THREE)).toBe(null);
    expect(buildSharePayload('', THREE)).toBe(null);
    expect(buildSharePayload('Ryan', [])).toBe(null);
  });
});

describe('encode and decode', () => {
  it('round-trips', () => {
    const p = buildSharePayload('Dave', THREE);
    expect(decodeShare(encodeShare(p))).toEqual(p);
  });

  // + / = do not survive a URL, and this travels in a link.
  it('produces a URL-safe string', () => {
    const code = encodeShare(buildSharePayload('Dave', THREE));
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('stays small enough to put in a link', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      night(`2026-${String(1 + (i % 12)).padStart(2, '0')}-0${1 + (i % 9)}`, { Dave: [150, 160, 170] }));
    expect(encodeShare(buildSharePayload('Dave', many)).length).toBeLessThan(900);
  });

  // A future version may carry a shape this build cannot read. Refusing
  // is right; guessing imports something wrong and looks like it worked.
  it('refuses a payload from a version it does not know', () => {
    const code = encodeShare({ ...buildSharePayload('Dave', THREE), v: SHARE_VERSION + 1 });
    expect(decodeShare(code)).toBe(null);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, '', '   ', 'not-base64!!', 42, {}, 'YWJj']) {
      expect(() => decodeShare(junk)).not.toThrow();
      expect(decodeShare(junk)).toBe(null);
    }
    expect(encodeShare(null)).toBe('');
  });
});

describe('nightsFromPayload', () => {
  it('rebuilds nights the app can score', () => {
    const out = nightsFromPayload(decodeShare(encodeShare(buildSharePayload('Dave', THREE))));
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe('2026-09-04');
    expect(out[0].scoresByBowler.Dave).toEqual([130, 128, 140]);
  });

  // The sender typed "Dave"; the account is "Dave M". The nights should
  // land under the name the receiving app actually uses.
  it('can file them under the receiving bowler’s own name', () => {
    const out = nightsFromPayload(decodeShare(encodeShare(buildSharePayload('Dave', THREE))), 'Dave M');
    expect(out[0].scoresByBowler['Dave M']).toEqual([130, 128, 140]);
    expect(out[0].scoresByBowler.Dave).toBeUndefined();
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}, { d: 'nope' }]) {
      expect(nightsFromPayload(junk)).toEqual([]);
    }
  });
});

describe('mergeSharedNights', () => {
  const imported = nightsFromPayload(decodeShare(encodeShare(buildSharePayload('Dave', THREE))));

  it('adds nights you did not have', () => {
    const r = mergeSharedNights([], imported, 'Dave');
    expect(r.nights).toHaveLength(2);
    expect(r.added).toBe(2);
  });

  // The whole reason nights travel rather than badges: loading the same
  // link twice must change nothing.
  it('is idempotent — the same link twice adds nothing', () => {
    const once = mergeSharedNights([], imported, 'Dave');
    const twice = mergeSharedNights(once.nights, imported, 'Dave');
    expect(twice.nights).toHaveLength(2);
    expect(twice.added).toBe(0);
    expect(twice.skipped).toBe(2);
  });

  // The device that scored a night is the better source for it; an import
  // is a copy made on someone else's phone.
  it('keeps what you already had for a night you both have', () => {
    const mine = [night('2026-09-04', { Dave: [999, 999, 999] })];
    const r = mergeSharedNights(mine, imported, 'Dave');
    expect(r.nights.find(n => n.date === '2026-09-04').scoresByBowler.Dave).toEqual([999, 999, 999]);
  });

  it('folds into a night you have but were not on', () => {
    const mine = [night('2026-09-04', { Ryan: [145, 162, 151] })];
    const r = mergeSharedNights(mine, imported, 'Dave');
    const n = r.nights.find(x => x.date === '2026-09-04');
    expect(n.scoresByBowler.Ryan).toEqual([145, 162, 151]);
    expect(n.scoresByBowler.Dave).toEqual([130, 128, 140]);
  });

  it('returns them in date order', () => {
    const r = mergeSharedNights([night('2026-10-01', { Dave: [100] })], imported, 'Dave');
    expect(r.nights.map(n => n.date)).toEqual(['2026-09-04', '2026-09-11', '2026-10-01']);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}, [null]]) {
      expect(() => mergeSharedNights(junk, junk, junk)).not.toThrow();
    }
  });
});

describe('describeImport', () => {
  it('says what happened in one line', () => {
    expect(describeImport({ added: 4, skipped: 0 })).toBe('4 nights added.');
    expect(describeImport({ added: 1, skipped: 0 })).toBe('1 night added.');
    expect(describeImport({ added: 2, skipped: 3 })).toBe('2 nights added. 3 nights you already had.');
    expect(describeImport({ added: 0, skipped: 1 })).toContain('already had');
    expect(describeImport({ added: 0, skipped: 0 })).toContain('Nothing');
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42]) {
      expect(() => describeImport(junk)).not.toThrow();
    }
  });
});
