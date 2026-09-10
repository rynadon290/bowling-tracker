// Installs a user-scoping wrapper over window.storage.
//
// Why here and not at the call sites: there are 107 window.storage calls
// in BowlingTracker alone across 36 named key constants, plus at least one
// inline key literal that no constant covers. Rewriting all of them would
// be a large diff with a long tail of missed cases, and HANDOFF 4.3 is a
// record of exactly that failure mode -- field-by-field handling that
// silently drops whatever nobody remembered to list. One choke point
// scopes every key, including ones added later, with no further
// discipline required from callers.
import {
  scopedKey,
  getActiveUserId,
  setActiveUserId,
  isScopedKey,
  keyBelongsTo,
  isAdoptableLegacyKey,
  LEGACY_ADOPTED_KEY,
} from "./domain/userScope.js";

// The unscoped adapter underneath. Identical to the one BowlingTracker
// installs; kept here so import order cannot decide which one wins.
function browserAdapter() {
  return {
    async get(key) {
      const value = window.localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value) {
      window.localStorage.setItem(key, value);
      return { value };
    },
    async delete(key) {
      window.localStorage.removeItem(key);
    },
  };
}

// Every raw key currently on the device. Needed for adoption and for
// clearing one user's cache; both have to work on keys nobody enumerated.
function rawKeys() {
  const out = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k !== null) out.push(k);
  }
  return out;
}

export function installScopedStorage() {
  if (typeof window === "undefined") return null;
  if (window.storage && window.storage.__scoped) return window.storage;

  // Wrap whatever is already there if something installed first (a host
  // storage API, or BowlingTracker's own adapter), otherwise supply the
  // browser one. Wrapping rather than replacing means this is safe to
  // import from more than one module, in any order.
  const base = (window.storage && typeof window.storage.get === "function")
    ? window.storage
    : browserAdapter();

  const scoped = {
    __scoped: true,
    __base: base,
    async get(key) { return base.get(scopedKey(key)); },
    async set(key, value) { return base.set(scopedKey(key), value); },
    async delete(key) { return base.delete(scopedKey(key)); },
  };

  window.storage = scoped;
  return scoped;
}

// Called by AuthProvider on every auth transition. Setting this to null on
// sign-out is what makes the cache unreadable rather than merely
// unattributed: with no active user, reads fall back to the unscoped key,
// which after adoption holds nothing.
export function setStorageUser(userId) {
  return setActiveUserId(userId);
}

// Moves pre-scoping data into the first signed-in user's namespace, once
// per device, then removes the originals.
//
// The alternative -- leaving legacy keys in place and reading them as a
// fallback -- would mean bowler B, signing in on a phone A had been using,
// still reads A's cache. That is the bug, kept alive as a compatibility
// shim. Adopting and deleting closes it: after this runs there is no
// unscoped data left for anyone to inherit.
//
// It is a real trade and worth stating plainly, because the wrong outcome
// is concrete rather than theoretical: ON A SHARED PHONE, WHOEVER SIGNS
// IN FIRST AFTER THIS UPDATE INHERITS THE PREVIOUS PERSON'S DATA. If A has
// been using the phone and B signs in first, B gets A's cached history and
// A's queued writes. That is a genuine wrong result, not an edge case
// nobody will hit.
//
// It is accepted because the alternative is worse in every direction. The
// pre-scoping data has no recorded owner -- there is nothing on the device
// that says whose it is -- so any rule here is a guess. This guess is
// right essentially always (the person signing in is the person holding
// the phone), it happens exactly once per device, and it is strictly
// better than today, where EVERY subsequent user inherits that data, not
// just the first. Discarding the data instead would silently destroy
// unsynced games for every existing bowler on upgrade.
//
// Do not "fix" this by scoping the marker key or by re-running adoption
// per user. Both re-open the bug this exists to close.
export async function adoptLegacyData(userId) {
  if (typeof window === "undefined" || !userId) return { adopted: 0, skipped: true };
  const store = (window.storage && window.storage.__base) || browserAdapter();

  const already = await store.get(LEGACY_ADOPTED_KEY);
  if (already) return { adopted: 0, skipped: true };

  let adopted = 0;
  for (const key of rawKeys()) {
    if (!isAdoptableLegacyKey(key)) continue;
    const existing = await store.get(key);
    if (!existing) continue;
    const target = scopedKey(key, userId);
    // Never overwrite: if this user already has scoped data for a key,
    // theirs wins. Losing a real value to a stale legacy one would be a
    // silent regression in exactly the direction this change exists to
    // prevent.
    const mine = await store.get(target);
    if (!mine) { await store.set(target, existing.value); adopted++; }
    await store.delete(key);
  }
  await store.set(LEGACY_ADOPTED_KEY, new Date().toISOString());
  return { adopted, skipped: false };
}

// Removes one user's cached data from this device. Not called on ordinary
// sign-out -- namespacing already provides the isolation, and wiping would
// throw away the delta-sync cursors built in session 4, making every
// sign-in a full history re-download. Exposed so a deliberate "remove my
// data from this phone" action can use it.
export async function clearUserCache(userId) {
  if (typeof window === "undefined" || !userId) return 0;
  const store = (window.storage && window.storage.__base) || browserAdapter();
  let removed = 0;
  for (const key of rawKeys()) {
    if (isScopedKey(key) && keyBelongsTo(key, userId)) { await store.delete(key); removed++; }
  }
  return removed;
}

export { getActiveUserId };

installScopedStorage();
