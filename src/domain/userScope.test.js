import { describe, it, expect } from 'vitest';
import {
  setActiveUserId, getActiveUserId,
  scopedKey, isScopedKey, parseScopedKey, keyBelongsTo,
  isUnowned, ownedBy, partitionQueue, countForUser,
  isAdoptableLegacyKey, LEGACY_ADOPTED_KEY, SCOPE_PREFIX,
} from './userScope.js';

// The bug these protect against was reproduced in a real browser before
// any of this was written: bowler A logged a shot offline, signed out,
// and bowler B signing in flushed it into B's account -- then deleted it
// from the queue, so A lost it outright. Both halves matter, and the
// second is the one that would have been easy to declare fixed while
// still losing the shot.

describe('scopedKey', () => {
  it('namespaces a key under its owner', () => {
    expect(scopedKey('bowling-shots-v2', 'user-a')).toBe(SCOPE_PREFIX + 'user-a:bowling-shots-v2');
  });

  it('gives two users different keys for the same logical thing', () => {
    expect(scopedKey('bowling-shots-v2', 'user-a')).not.toBe(scopedKey('bowling-shots-v2', 'user-b'));
  });

  // The upgrade path. A device that has never scoped anything must still
  // find its existing data through the old key, or every current bowler
  // opens the app to an empty history on the first launch after this
  // ships. Adoption moves it across once, deliberately.
  it('leaves a key alone when there is no owner', () => {
    expect(scopedKey('bowling-shots-v2', null)).toBe('bowling-shots-v2');
  });

  it('never double-scopes an already scoped key', () => {
    const once = scopedKey('bowling-shots-v2', 'user-a');
    expect(scopedKey(once, 'user-b')).toBe(once);
  });

  it('falls back to the active user when none is given', () => {
    setActiveUserId('user-c');
    expect(getActiveUserId()).toBe('user-c');
    expect(scopedKey('bowling-goals-v1')).toBe(SCOPE_PREFIX + 'user-c:bowling-goals-v1');
    setActiveUserId(null);
    expect(scopedKey('bowling-goals-v1')).toBe('bowling-goals-v1');
  });

  it('treats an empty or non-string user id as no owner', () => {
    for (const bad of ['', null, undefined, 0, {}, []]) {
      setActiveUserId(bad);
      expect(getActiveUserId()).toBe(null);
    }
    setActiveUserId(null);
  });
});

describe('parseScopedKey', () => {
  it('round-trips', () => {
    const k = scopedKey('bowling-sessions-v2', 'abc-123');
    expect(parseScopedKey(k)).toEqual({ userId: 'abc-123', key: 'bowling-sessions-v2' });
  });

  // Returning a plausible-looking wrong answer for an unscoped key is
  // how a caller ends up believing legacy data has an owner.
  it('returns null for an unscoped key rather than guessing', () => {
    expect(parseScopedKey('bowling-shots-v2')).toBe(null);
    expect(isScopedKey('bowling-shots-v2')).toBe(false);
  });

  it('survives a key whose value contains colons', () => {
    const k = scopedKey('bowling-a:b:c', 'user-a');
    expect(parseScopedKey(k)).toEqual({ userId: 'user-a', key: 'bowling-a:b:c' });
  });

  it('only matches the owning user', () => {
    const k = scopedKey('bowling-shots-v2', 'user-a');
    expect(keyBelongsTo(k, 'user-a')).toBe(true);
    expect(keyBelongsTo(k, 'user-b')).toBe(false);
    expect(keyBelongsTo(k, null)).toBe(false);
    expect(keyBelongsTo('bowling-shots-v2', 'user-a')).toBe(false);
  });
});

describe('queue ownership', () => {
  const mine   = { queueId: 1, table: 'shots', userId: 'user-a' };
  const theirs = { queueId: 2, table: 'shots', userId: 'user-b' };
  const legacy = { queueId: 3, table: 'shots' };            // queued before this existed

  it('recognises whose item is whose', () => {
    expect(ownedBy(mine, 'user-a')).toBe(true);
    expect(ownedBy(theirs, 'user-a')).toBe(false);
    expect(ownedBy(legacy, 'user-a')).toBe(false);
    expect(isUnowned(legacy)).toBe(true);
    expect(isUnowned(mine)).toBe(false);
  });

  // The heart of it. An unowned item must NOT fall into the current
  // user's bucket -- that silent default is the original bug.
  it('never puts an unowned item in the current user\'s bucket', () => {
    const { mine: m, unowned, others } = partitionQueue([mine, theirs, legacy], 'user-a');
    expect(m.map(i => i.queueId)).toEqual([1]);
    expect(unowned.map(i => i.queueId)).toEqual([3]);
    expect(others.map(i => i.queueId)).toEqual([2]);
  });

  it('gives a signed-out session nothing to flush', () => {
    const { mine: m } = partitionQueue([mine, theirs, legacy], null);
    expect(m).toEqual([]);
  });

  // The pending badge is a claim about the bowler's own unsynced games.
  it('counts only the current user\'s backlog', () => {
    expect(countForUser([mine, theirs, legacy], 'user-a')).toBe(1);
    expect(countForUser([mine, theirs, legacy], 'user-b')).toBe(1);
    expect(countForUser([mine, theirs, legacy], null)).toBe(0);
  });

  // HANDOFF 4.4: guards that check null but not type are the single most
  // common defect in this codebase.
  it('survives junk input', () => {
    for (const junk of [null, undefined, 'x', 42, {}, []]) {
      expect(() => partitionQueue(junk, 'user-a')).not.toThrow();
      expect(partitionQueue(junk, 'user-a').mine).toEqual([]);
      expect(isUnowned(junk)).toBe(false);
      expect(ownedBy(junk, 'user-a')).toBe(false);
    }
  });
});

describe('legacy adoption', () => {
  it('adopts app keys, including ones no constant covers', () => {
    // This one is written inline at a single call site in
    // BowlingTracker, not through a named constant. An enumerated list
    // would have missed it -- the omission HANDOFF 4.3 records biting
    // four separate times.
    expect(isAdoptableLegacyKey('bowling-ball-lane-lines-v1')).toBe(true);
    expect(isAdoptableLegacyKey('bowling-shots-v2')).toBe(true);
  });

  it('never adopts an already scoped key', () => {
    expect(isAdoptableLegacyKey(scopedKey('bowling-shots-v2', 'user-a'))).toBe(false);
  });

  // The marker is a fact about the device, not about a user. Scoping it
  // would let the second person to sign in re-run adoption and claim the
  // first person's data -- the bug re-entering through its own fix.
  it('never adopts its own marker', () => {
    expect(isAdoptableLegacyKey(LEGACY_ADOPTED_KEY)).toBe(false);
  });

  it('ignores keys belonging to anything else on the origin', () => {
    for (const k of ['sb-auth-token', 'theme', '', null, undefined, 42]) {
      expect(isAdoptableLegacyKey(k)).toBe(false);
    }
  });
});
