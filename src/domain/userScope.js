// Who the local device currently belongs to, and how anything stored on
// it gets attributed to that person.
//
// The bug this exists to close: nothing local carried an owner. Storage
// keys were global constants ("bowling-shots-v2") and queued writes
// recorded a table, an operation and a payload but never a user. So on a
// shared phone -- which at a league night is not hypothetical -- bowler A
// could log a shot offline, sign out, and have bowler B sign in and flush
// it into B's account. Verified in a real browser: the shot landed in B's
// account AND was deleted from the queue, so A did not merely leak it,
// A lost it.
//
// Everything here is pure except the module-level active-user register,
// which is deliberately plain data so this file stays testable in the
// Node harness -- no React, no IndexedDB, no window.

// ── Who is signed in ────────────────────────────────────────────────────
//
// One register, read by both the storage wrapper and the sync queue, so
// the two can never disagree about whose data they are handling. That
// disagreement is precisely how the same bug appeared in two places.
let activeUserId = null;

export function setActiveUserId(id) {
  activeUserId = (typeof id === "string" && id) ? id : null;
  return activeUserId;
}

export function getActiveUserId() {
  return activeUserId;
}

// ── Namespacing storage keys ────────────────────────────────────────────
//
// Prefix rather than suffix: a prefix makes "everything belonging to this
// user" a single startsWith() scan, which is what clearing a user's cache
// needs. The separator is ":" and user ids are UUIDs, which cannot
// contain one, so a scoped key can never be ambiguous.
export const SCOPE_PREFIX = "u:";

// A key with no owner stays exactly as it was. That is what makes the
// upgrade safe: a device that has never scoped anything still reads its
// existing data through the old key, and adoptLegacy() below moves it
// across once, deliberately, rather than the app silently appearing empty
// on the first launch after the update.
export function scopedKey(key, userId = activeUserId) {
  if (typeof key !== "string" || !key) return key;
  if (!userId) return key;
  if (isScopedKey(key)) return key; // never double-scope
  return `${SCOPE_PREFIX}${userId}:${key}`;
}

export function isScopedKey(key) {
  return typeof key === "string" && key.startsWith(SCOPE_PREFIX);
}

// Splits a scoped key back into its parts. Returns null for an unscoped
// key rather than guessing, so callers have to handle the legacy case
// explicitly instead of receiving a plausible-looking wrong answer.
export function parseScopedKey(key) {
  if (!isScopedKey(key)) return null;
  const rest = key.slice(SCOPE_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0) return null;
  return { userId: rest.slice(0, i), key: rest.slice(i + 1) };
}

export function keyBelongsTo(key, userId) {
  const parsed = parseScopedKey(key);
  return !!parsed && !!userId && parsed.userId === userId;
}

// ── Queue ownership ─────────────────────────────────────────────────────
//
// An item queued before this change has no userId at all. Treating those
// as belonging to whoever happens to be signed in is the original bug;
// treating them as belonging to nobody would strand real unsynced games
// forever. So they are a third state -- unowned -- adopted exactly once,
// by the first person to sign in after the update, and never again.
//
// This is safe in a way it would not be in a general offline-first app:
// AuthGate does not render the tracker at all without a session, so the
// only writes that can ever be unowned are legacy ones from before the
// fix shipped.
// A queue item is identified by shape, not just by being truthy. `{}` and
// `[]` are both objects and both would have sailed through a plain null
// check -- HANDOFF 4.4's "guards that check null but not type", which is
// the single most common defect in this codebase and which my first
// version of this file reproduced. A malformed row in IndexedDB must not
// be adoptable.
function isQueueItem(item) {
  return !!item
    && typeof item === "object"
    && !Array.isArray(item)
    && typeof item.table === "string";
}

export function isUnowned(item) {
  return isQueueItem(item) && !item.userId;
}

export function ownedBy(item, userId) {
  if (!isQueueItem(item) || !userId) return false;
  return item.userId === userId;
}

// Splits a queue into what the current user may flush and what must be
// left alone. `mine` is deliberately strict: unowned items are NOT
// included. They only ever move through adoption.
export function partitionQueue(items, userId) {
  const all = Array.isArray(items) ? items : [];
  return {
    mine: all.filter((i) => ownedBy(i, userId)),
    unowned: all.filter((i) => isUnowned(i)),
    others: all.filter((i) => !ownedBy(i, userId) && !isUnowned(i)),
  };
}

// A count that means what the pending-sync indicator claims it means:
// how many of MY writes have not reached the cloud. Counting another
// bowler's backlog into my badge would be its own small lie.
export function countForUser(items, userId) {
  return partitionQueue(items, userId).mine.length;
}

// ── One-time legacy adoption ────────────────────────────────────────────
//
// Marker key is intentionally NOT scoped: it is a fact about the device
// ("the pre-scoping data on this device has been claimed"), not about a
// user, and scoping it would let a second user re-run the adoption and
// claim the first user's data -- reintroducing the bug through the very
// mechanism meant to close it.
export const LEGACY_ADOPTED_KEY = "bowling-legacy-adopted-v1";

// The keys carried across on adoption are discovered, not listed. An
// earlier version of this file enumerated them and would have missed
// "bowling-ball-lane-lines-v1", which is written inline at one call site
// rather than through a named constant -- the same field-by-field
// omission that HANDOFF 4.3 records biting four times.
export function isAdoptableLegacyKey(key) {
  return typeof key === "string"
    && key.startsWith("bowling-")
    && !isScopedKey(key)
    && key !== LEGACY_ADOPTED_KEY;
}
