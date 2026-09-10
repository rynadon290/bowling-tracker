import { describe, it, expect } from 'vitest';
import { mergeDelta, nextCursor } from './deltaSync.js';

// This is the logic a lost or resurrected shot would come from, so it's
// tested more exhaustively than most domain functions in this codebase.

describe('mergeDelta', () => {
  it('starts from nothing when there is no existing cache', () => {
    const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    expect(mergeDelta([], rows, [])).toEqual(rows);
  });

  it('leaves the cache alone when nothing changed', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const result = mergeDelta(existing, [], []);
    expect(result).toEqual(existing);
  });

  it('adds a new row without touching the rest', () => {
    const existing = [{ id: 'a', v: 1 }];
    const result = mergeDelta(existing, [{ id: 'b', v: 1 }], []);
    expect(result.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('replaces an existing row with its updated version', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const result = mergeDelta(existing, [{ id: 'a', v: 2 }], []);
    expect(result.find(r => r.id === 'a').v).toBe(2);
    expect(result.find(r => r.id === 'b').v).toBe(1);
  });

  it('removes a tombstoned row that exists in the cache', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const result = mergeDelta(existing, [], ['b']);
    expect(result.map(r => r.id)).toEqual(['a']);
  });

  it('ignores a tombstone for an id that was never cached', () => {
    const existing = [{ id: 'a', v: 1 }];
    expect(() => mergeDelta(existing, [], ['nope'])).not.toThrow();
    expect(mergeDelta(existing, [], ['nope'])).toEqual(existing);
  });

  // The guarantee the whole feature depends on: a shot edited and then
  // deleted between two syncs must end up deleted, not resurrected by
  // its own edit arriving in the same batch.
  it('a tombstone beats an incoming update for the same id', () => {
    const existing = [{ id: 'a', v: 1 }];
    const result = mergeDelta(existing, [{ id: 'a', v: 99 }], ['a']);
    expect(result.find(r => r.id === 'a')).toBeUndefined();
  });

  it('a fresh row that is also tombstoned in the same batch never appears', () => {
    // e.g. logged and deleted again before this device ever synced.
    const result = mergeDelta([], [{ id: 'a', v: 1 }], ['a']);
    expect(result).toEqual([]);
  });

  it('never produces a duplicate id', () => {
    const existing = [{ id: 'a', v: 1 }];
    const result = mergeDelta(existing, [{ id: 'a', v: 2 }, { id: 'a', v: 3 }], []);
    const ids = result.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.find(r => r.id === 'a').v).toBe(3);
  });

  it('a realistic round: one unchanged, one edited, one deleted, one new', () => {
    const existing = [
      { id: 'shot1', v: 'orig' }, { id: 'shot2', v: 'orig' }, { id: 'shot3', v: 'orig' },
    ];
    const result = mergeDelta(existing,
      [{ id: 'shot2', v: 'edited' }, { id: 'shot4', v: 'new' }],
      ['shot3']);
    const byId = Object.fromEntries(result.map(r => [r.id, r.v]));
    expect(byId).toEqual({ shot1: 'orig', shot2: 'edited', shot4: 'new' });
  });

  describe('bad input', () => {
    it('never throws', () => {
      const junk = [null, undefined, '', 5, {}, NaN, true];
      for (const v of junk) {
        expect(() => mergeDelta(v, v, v)).not.toThrow();
      }
    });

    it('treats a non-array as empty rather than guessing', () => {
      expect(mergeDelta(null, null, null)).toEqual([]);
      expect(mergeDelta({}, {}, {})).toEqual([]);
    });

    it('skips a row with no id instead of poisoning the cache', () => {
      const result = mergeDelta([], [{ v: 1 }, { id: null, v: 2 }, { id: 'a', v: 3 }], []);
      expect(result).toEqual([{ id: 'a', v: 3 }]);
    });
  });
});

describe('nextCursor', () => {
  it('stays null with nothing to advance it', () => {
    expect(nextCursor(null, [])).toBeNull();
  });

  it('does not advance when a fetch returns nothing new', () => {
    expect(nextCursor('2026-09-01T00:00:00.000Z', [])).toBe('2026-09-01T00:00:00.000Z');
  });

  it('advances to the latest timestamp with no prior cursor', () => {
    expect(nextCursor(null, ['2026-09-01T10:00:00.000Z', '2026-09-03T10:00:00.000Z']))
      .toBe('2026-09-03T10:00:00.000Z');
  });

  // The invariant that matters: a cursor must never move backward, or a
  // later sync would re-declare "since" an earlier point and the whole
  // point of delta sync (not re-fetching old data) breaks.
  it('never moves backward', () => {
    const cursor = nextCursor('2026-09-10T00:00:00.000Z', ['2026-09-01T00:00:00.000Z']);
    expect(cursor).toBe('2026-09-10T00:00:00.000Z');
  });

  it('advances past the prior cursor when something is genuinely newer', () => {
    const cursor = nextCursor('2026-09-01T00:00:00.000Z', ['2026-09-05T00:00:00.000Z']);
    expect(cursor).toBe('2026-09-05T00:00:00.000Z');
  });

  it('ignores unparseable timestamps rather than throwing', () => {
    const cursor = nextCursor(null, ['not a date', '2026-09-05T00:00:00.000Z', '']);
    expect(cursor).toBe('2026-09-05T00:00:00.000Z');
  });

  it('falls back to the previous cursor when everything is unparseable', () => {
    expect(nextCursor('2026-09-01T00:00:00.000Z', ['garbage', null])).toBe('2026-09-01T00:00:00.000Z');
  });

  it('does not depend on input order', () => {
    const a = nextCursor(null, ['2026-09-01T00:00:00.000Z', '2026-09-09T00:00:00.000Z', '2026-09-05T00:00:00.000Z']);
    const b = nextCursor(null, ['2026-09-09T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-05T00:00:00.000Z']);
    expect(a).toBe(b);
  });

  describe('bad input', () => {
    it('never throws', () => {
      for (const v of [null, undefined, '', 5, {}, NaN, true, []]) {
        expect(() => nextCursor(v, v)).not.toThrow();
      }
    });
  });

  // Two syncs back to back must advance monotonically -- this is the
  // property the whole feature relies on, exercised as one sequence.
  it('advances monotonically across two rounds of a real sync', () => {
    const round1 = nextCursor(null, ['2026-09-01T20:00:00.000Z', '2026-09-01T20:05:00.000Z']);
    const round2 = nextCursor(round1, ['2026-09-08T20:00:00.000Z']);
    expect(round1 < round2).toBe(true);
  });
});

// A cursor older than the tombstone retention window must NOT be used.
//
// Tombstones are pruned after 90 days. A device away longer than that
// could never learn about deletes that happened while it was gone, so a
// delta sync would silently resurrect shots the bowler had removed. The
// app falls back to a full resync instead — one expensive load after
// months away, which is the right trade against wrong data.
describe('cursor staleness', () => {
  const RETENTION_DAYS = 90;
  const MARGIN_DAYS = 7;
  const usable = iso => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return false;
    return (Date.now() - t) / 86400000 < RETENTION_DAYS - MARGIN_DAYS;
  };
  const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

  it('uses a recent cursor', () => {
    expect(usable(daysAgo(1))).toBe(true);
    expect(usable(daysAgo(30))).toBe(true);
  });

  it('rejects a cursor near the retention boundary, with margin to spare', () => {
    expect(usable(daysAgo(82))).toBe(true);
    expect(usable(daysAgo(84))).toBe(false);
    expect(usable(daysAgo(RETENTION_DAYS))).toBe(false);
  });

  it('rejects a missing or corrupted cursor rather than trusting it', () => {
    expect(usable(null)).toBe(false);
    expect(usable(undefined)).toBe(false);
    expect(usable('garbage')).toBe(false);
    expect(usable('')).toBe(false);
  });
});

// The scenarios a delete actually goes through, end to end.
describe('deletes across devices', () => {
  it('a tombstone for an already-locally-deleted row is harmless', () => {
    // The device that did the delete already removed it from its cache.
    const cached = [{ id: 's1' }, { id: 's2' }];
    expect(mergeDelta(cached, [], ['s3']).map(r => r.id)).toEqual(['s1', 's2']);
  });

  it('a tombstone removes the row on a device that still has it', () => {
    const otherDevice = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    expect(mergeDelta(otherDevice, [], ['s3']).map(r => r.id)).toEqual(['s1', 's2']);
  });

  it('an updated row keeps its position so dedup precedence is stable', () => {
    // migrateShots keeps the LAST occurrence of a duplicate key, so an
    // in-place update must not jump to the end and outrank a real
    // later row.
    const cached = [{ id: 'a', v: 'old' }, { id: 'b', v: 'old' }];
    const merged = mergeDelta(cached, [{ id: 'a', v: 'new' }, { id: 'c', v: 'new' }], []);
    expect(merged.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(merged[0].v).toBe('new');
  });
});
