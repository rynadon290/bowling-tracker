import { openDB } from 'idb';
import { supabase } from './supabaseClient.js';
export { classifySyncError, shouldSurfaceSyncIssue } from './domain/syncErrors.js';
import { getActiveUserId, partitionQueue, ownedBy } from './domain/userScope.js';

// Every queued write records WHO queued it, and nothing is ever replayed
// through a different person's session.
//
// Without this, the queue was a bearer token: it held a table, an
// operation and a payload, and flushPendingQueue sent them through
// whichever supabase client happened to be signed in when it next ran.
// Bowler A logging a shot offline, signing out, and handing the phone to
// bowler B put A's shot in B's account -- and deleted it from the queue
// on success, so A did not get it back. Confirmed in a real browser
// against real IndexedDB before this was written.

// Requires the `idb` package (a small, standard Promise wrapper around the
// browser's IndexedDB API): npm install idb

// Postgres/PostgREST errors carry more than just a message — `hint` in
// particular often states the exact fix (e.g. "Grant the required
// privileges with: GRANT SELECT ON public.x TO authenticated;"), and
// `details`/`code` add further context. Capturing only `.message` (as this
// file did until now) throws away information Postgres is actively trying
// to hand back.
function formatError(err) {
  const parts = [];
  if (err?.message) parts.push(err.message);
  if (err?.hint) parts.push(`Hint: ${err.hint}`);
  if (err?.details) parts.push(`Details: ${err.details}`);
  if (err?.code) parts.push(`(${err.code})`);
  return parts.length ? parts.join(' — ') : String(err);
}

const DB_NAME = 'bowling-tracker-sync';
const DB_VERSION = 1;
const STORE_NAME = 'pending_writes';

let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'queueId', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

// Races a promise against a timer. If the timer wins, we treat that as "no
// signal right now" and fall back to the local queue — even if the network
// call might still succeed later on its own; we just won't wait around for
// it at the lanes.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const listeners = new Set();
function notifyListeners(count) {
  listeners.forEach((cb) => cb(count));
}
// Lets the UI subscribe to the pending-write count, e.g. to show a small
// "3 shots pending sync" indicator. Returns an unsubscribe function.
export function onPendingCountChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// The pending-sync badge must count MY unsynced writes. Counting the
// whole store would show a bowler another bowler's backlog and, worse,
// imply their own games were still in flight when they were not.
export async function getPendingCount() {
  return (await myItems()).length;
}

// A per-table breakdown of what's actually stuck in the queue, for
// diagnosing a count that isn't draining — e.g. flushPendingQueue() stops
// at the first failure to preserve ordering, so one permanently-broken
// item can freeze everything queued behind it indefinitely.
export async function inspectPendingQueue() {
  const all = await myItems();
  const byTable = {};
  const reasonsByTable = {};
  all.forEach(item => {
    byTable[item.table] = (byTable[item.table] || 0) + 1;
    if (!reasonsByTable[item.table] && item.reason) reasonsByTable[item.table] = item.reason;
  });
  // The structured error from the oldest failure, so the UI can classify
  // it into plain language rather than showing the raw string. `reason`
  // is the human-readable text; `errorCode` is what actually drives the
  // classification, since message wording varies.
  const firstFailed = all.find(item => item.reason || item.errorCode) || null;
  const firstError = firstFailed
    ? { code: firstFailed.errorCode || "", message: firstFailed.reason || "" }
    : null;
  const oldestAgeMs = all.length
    ? Date.now() - Math.min(...all.map(i => i.createdAt || Date.now()))
    : 0;

  return { total: all.length, byTable, reasonsByTable, items: all, firstError, oldestAgeMs };
}

// Discards every queued write without attempting to sync it. Use with real
// caution — anything only sitting in the queue (never confirmed as having
// reached Supabase) is gone for good after this. Appropriate right before
// a full data wipe/re-entry, where that backlog is about to be irrelevant
// anyway; not appropriate as a routine fix for a slow connection.
// Discards the ENTIRE backlog. Deliberately blunt and deliberately named:
// every unsynced shot, session, and match result goes with it, and it
// cannot be undone. This is a last resort for a queue that's wedged beyond
// repair -- for one stuck item, use discardQueuedItem instead so the rest
// of someone's night isn't collateral damage.
export async function clearPendingQueue() {
  const db = await getDb();
  // Blunt, but only within one account. Discarding another bowler's
  // backlog because this bowler's queue was wedged would be a second
  // cross-account bug wearing the first one's clothes.
  const all = await myItems();
  for (const item of all) {
    await db.delete(STORE_NAME, item.queueId);
  }
  notifyListeners(await getPendingCount());
}

// Discards ONE stuck item, leaving everything else queued.
//
// This is the fix for the usual failure: a single malformed record that
// will never succeed (bad data, a since-deleted parent row) blocks the
// queue, because flushPendingQueue stops at the first failure to preserve
// ordering. Previously the only remedy was throwing away the whole
// backlog, which meant losing good writes to get rid of one bad one.
export async function discardQueuedItem(queueId) {
  const db = await getDb();
  // Ownership is re-checked here rather than trusted from the UI: the id
  // came from a list this user was shown, but a stale render or a second
  // tab could hand over an id that is no longer theirs.
  const item = await db.get(STORE_NAME, queueId);
  if (!item || !ownedBy(item, getActiveUserId())) return;
  await db.delete(STORE_NAME, queueId);
  notifyListeners(await getPendingCount());
}

// Discards every queued item for one table, for when a whole feature's
// writes are wedged (e.g. a table dropped or renamed) but the rest of the
// queue is fine.
export async function discardQueuedTable(table) {
  const db = await getDb();
  const all = await myItems();
  for (const item of all) {
    if (item.table === table) await db.delete(STORE_NAME, item.queueId);
  }
  notifyListeners(await getPendingCount());
}

async function queueWrite(table, operation, payload, reason, onConflict, errorCode = "") {
  const db = await getDb();
  // onConflict is stored with the item so the retry resolves against the
  // same column as the original attempt -- replaying without it would hit
  // the exact primary-key mismatch the original call was avoiding.
  // errorCode is the Postgres SQLSTATE (23505, 42501, ...). Stored
  // separately from the human-readable reason because classification
  // keys off the code -- message wording varies between PostgREST
  // versions, the code does not.
  // userId is stamped at queue time, not at flush time. Flush time is
  // exactly when it is already wrong -- the whole failure is that the
  // person signed in then is not the person who made the write.
  await db.add(STORE_NAME, { table, operation, payload, reason, errorCode, onConflict, userId: getActiveUserId(), createdAt: Date.now() });
  notifyListeners(await getPendingCount());
}

// Every read below goes through this, so a new accessor cannot forget to
// filter. `mine` excludes unowned legacy items deliberately; those move
// only through adoptLegacyQueueItems.
async function myItems() {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  return partitionQueue(all, getActiveUserId()).mine;
}

// Claims pre-scoping queue items for the first user to sign in after this
// shipped. They carry no userId, so they would otherwise never flush and
// a real unsynced game would sit there forever. Runs once per device --
// the caller (AuthProvider) owns that guard, alongside the matching cache
// adoption, so the two cannot disagree about whether it has happened.
export async function adoptLegacyQueueItems(userId) {
  if (!userId) return 0;
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  let adopted = 0;
  for (const item of all) {
    if (!item.userId) { await db.put(STORE_NAME, { ...item, userId }); adopted++; }
  }
  if (adopted) notifyListeners(await getPendingCount());
  return adopted;
}

// Every pending record still needs a stable id the UI can reference before
// it's ever reached Supabase — so callers of cloudWrite must generate the
// id client-side (crypto.randomUUID()) and include it in `record`, rather
// than relying on Supabase's default gen_random_uuid(). That's also what
// makes retries safe: the same id every time means upsert (not insert) is
// the right call below, so a write that actually succeeded right as the
// timeout fired doesn't turn into a duplicate-key error on retry.
// `onConflict` names the column(s) that identify an existing row, when
// that isn't the primary key.
//
// Without it, PostgREST resolves conflicts against the PRIMARY KEY. For a
// table like user_preferences -- PK `id uuid default gen_random_uuid()`,
// but genuinely keyed by `user_id` -- a record with no id generates a new
// one every time, so nothing ever conflicts on the PK, Postgres attempts
// a plain INSERT, and that collides with unique(user_id). The first write
// succeeds and every subsequent one fails: settings appear to save once
// and then freeze.
export async function cloudWrite(table, record, { timeoutMs = 6000, onConflict } = {}) {
  try {
    const { error } = await withTimeout(
      onConflict
        ? supabase.from(table).upsert(record, { onConflict })
        : supabase.from(table).upsert(record),
      timeoutMs
    );
    if (error) throw error;
    return { synced: true, queued: false };
  } catch (err) {
    await queueWrite(table, 'upsert', record, formatError(err), onConflict, err?.code || '');
    return { synced: false, queued: true, reason: formatError(err) };
  }
}

// PARTIAL update: changes only the columns given, leaving every other
// column on the row untouched.
//
// This exists because upsert replaces the WHOLE row. Two features writing
// different columns of the same record -- a ball's drilling layout and its
// specs both live on `arsenals` -- would silently erase each other's data
// if both used cloudWrite. Saving a layout would null out the specs.
//
// `match` identifies the row the same way cloudDelete does: a plain id, or
// an object of column:value pairs for composite keys.
//
// Caveat worth knowing: unlike upsert, this does nothing if the row does
// not exist yet -- it updates, it does not create. Callers must ensure the
// row was created first (arsenals rows are created when the ball is added,
// well before any specs or layout edit can be debounced through here).
export async function cloudUpdate(table, match, changes, { timeoutMs = 6000 } = {}) {
  const matchObj = (typeof match === 'object' && match !== null) ? match : { id: match };
  try {
    let query = supabase.from(table).update(changes);
    Object.entries(matchObj).forEach(([k, v]) => { query = query.eq(k, v); });
    const { error } = await withTimeout(query, timeoutMs);
    if (error) throw error;
    return { synced: true, queued: false };
  } catch (err) {
    await queueWrite(table, 'update', { match: matchObj, changes }, formatError(err), undefined, err?.code || '');
    return { synced: false, queued: true, reason: formatError(err) };
  }
}

// `match` is either a plain id (for tables with a single `id` primary key)
// or an object of column:value pairs to match on — needed for tables like
// team_members, which use a composite primary key (team_id, user_id) with
// no single `id` column at all.
export async function cloudDelete(table, match, { timeoutMs = 6000 } = {}) {
  const matchObj = (typeof match === 'object' && match !== null) ? match : { id: match };
  try {
    let query = supabase.from(table).delete();
    Object.entries(matchObj).forEach(([k, v]) => { query = query.eq(k, v); });
    const { error } = await withTimeout(query, timeoutMs);
    if (error) throw error;
    return { synced: true, queued: false };
  } catch (err) {
    await queueWrite(table, 'delete', matchObj, formatError(err), undefined, err?.code || '');
    return { synced: false, queued: true, reason: formatError(err) };
  }
}

// Cloud-first read with a timeout, for the same reason writes need one — no
// signal at the lanes shouldn't hang the UI. `queryFn` receives the table's
// query builder so the caller can add .select()/.eq()/etc. however that
// table needs. On failure or timeout, returns online:false so the caller
// can fall back to whatever it has cached locally.
export async function cloudRead(table, queryFn, { timeoutMs = 6000 } = {}) {
  try {
    const { data, error } = await withTimeout(queryFn(supabase.from(table)), timeoutMs);
    if (error) throw error;
    return { data, online: true };
  } catch (err) {
    return { data: null, online: false, reason: formatError(err) };
  }
}

// Only what changed since `sinceIso`, plus the ids of anything deleted
// since then -- instead of `cloudRead`'s whole-table fetch.
//
// This is the actual egress fix: a returning bowler's app open used to
// pull their entire history every single time, which is most of what a
// hosted database charges for. Asking for "since X" instead means a
// quiet week costs almost nothing to sync, and a full season only ever
// gets paid for once.
//
// `table` needs an `updated_at` column that's actually maintained (see
// migration_delta_sync.sql -- a column that exists but is never bumped
// on UPDATE would make this silently miss every edit) and a matching
// trigger writing to sync_tombstones on delete, or deleted rows would
// keep reappearing forever on other devices.
//
// Same online:false contract as cloudRead: on any failure the caller
// falls back to whatever it already has cached, untouched.
export async function cloudReadDelta(table, sinceIso, { timeoutMs = 6000 } = {}) {
  try {
    const [rowsRes, tombstonesRes] = await withTimeout(Promise.all([
      supabase.from(table).select('*').gte('updated_at', sinceIso),
      supabase.from('sync_tombstones').select('row_id,deleted_at')
        .eq('table_name', table).gte('deleted_at', sinceIso),
    ]), timeoutMs);
    if (rowsRes.error) throw rowsRes.error;
    if (tombstonesRes.error) throw tombstonesRes.error;
    return { rows: rowsRes.data || [], tombstones: tombstonesRes.data || [], online: true };
  } catch (err) {
    return { rows: null, tombstones: null, online: false, reason: formatError(err) };
  }
}

// Returns any not-yet-synced records queued for a given table, so a read
// (e.g. loading shot history) can merge them in — otherwise a shot logged
// while offline would be invisible until the queue actually flushes.
export async function getQueuedRecordsForTable(table) {
  const all = await myItems();
  return all.filter((item) => item.table === table && item.operation === 'upsert').map((item) => item.payload);
}

// Flushes the queue in the order items were added. Stops at the first
// failure rather than skipping ahead — a later write can depend on an
// earlier one already existing (e.g. editing a shot that hasn't synced
// yet), so preserving order matters more than clearing whatever happens to
// succeed fastest.
export async function flushPendingQueue() {
  const db = await getDb();
  // Only this user's writes, and nothing at all when signed out. The
  // periodic 30s timer below fires regardless of who is signed in, which
  // is precisely how A's shot used to reach B without anyone touching
  // the app.
  const userId = getActiveUserId();
  if (!userId) return;
  const all = await myItems();

  for (const item of all) {
    try {
      let error;
      if (item.operation === 'delete') {
        let query = supabase.from(item.table).delete();
        Object.entries(item.payload).forEach(([k, v]) => { query = query.eq(k, v); });
        ({ error } = await query);
      } else if (item.operation === 'update') {
        // Replay a partial update as a partial update. Retrying it as an
        // upsert would replace the whole row with just the few columns
        // that were being changed -- erasing everything else on it.
        let query = supabase.from(item.table).update(item.payload.changes);
        Object.entries(item.payload.match).forEach(([k, v]) => { query = query.eq(k, v); });
        ({ error } = await query);
      } else {
        ({ error } = item.onConflict
          ? await supabase.from(item.table).upsert(item.payload, { onConflict: item.onConflict })
          : await supabase.from(item.table).upsert(item.payload));
      }
      if (error) throw error;
      await db.delete(STORE_NAME, item.queueId);
    } catch (err) {
      // Record why this retry failed too — items queued before reason
      // tracking existed (or whose failure reason has since changed) still
      // end up with something useful the next time someone inspects the
      // queue, without needing to discard and start over.
      await db.put(STORE_NAME, { ...item, reason: formatError(err) });
      break; // leave this item and everything after it queued; try again later
    }
  }
  notifyListeners(await getPendingCount());
}

// Retry triggers. The 'online' event isn't reliable across every
// browser/network combination, so a periodic poll backs it up.
if (typeof window !== 'undefined') {
  window.addEventListener('online', flushPendingQueue);
  setInterval(flushPendingQueue, 30000);
}

// ── Turning a Postgres error into something a bowler can act on ──────────
//
// The sync panel used to show the raw error -- table name, SQL constraint,
// error code. That's a debugging tool, and it was the default experience:
// a bowler saw `duplicate key value violates unique constraint
// "leagues_name_key" — (23505)` and had no idea whether their scores were
// safe, whether to tap Discard, or whether the app was broken.
//
// But auto-clearing the queue instead would be worse. A queued write is a
// bowler's game that hasn't reached the cloud yet. Silently discarding it
// means their 268 disappears and nothing ever tells them -- and they'd
// find out weeks later when a season average is wrong, with no way to
// reconstruct it. Data loss you can't see is worse than an error you can.
//
// So: classify. Retry what's retryable, explain what isn't, and only ever
// discard on a deliberate tap.

// Errors that will pass on their own once conditions change. The queue
// already retries these; the bowler doesn't need to do anything.
