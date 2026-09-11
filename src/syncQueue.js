import { openDB } from 'idb';
import { supabase } from './supabaseClient.js';
export { classifySyncError, shouldSurfaceSyncIssue } from './domain/syncErrors.js';
import { classifySyncError } from './domain/syncErrors.js';
import { getActiveUserId, partitionQueue, ownedBy } from './domain/userScope.js';
import { recordError } from './errorLogStore.js';

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
// A timeout that actually cancels the request, rather than just walking
// away from it.
//
// The old version raced the query against a timer and returned on
// whichever won. The HTTP request kept going regardless: it stayed on the
// connection, still counted against the browser's per-host limit, and
// still landed server-side whenever it eventually arrived. At the lanes,
// on bad signal, that meant a write the app had already given up on and
// queued could ALSO succeed minutes later -- the same row written twice,
// once through each path.
//
// It matters more now the queue is user-scoped: a queued write is
// replayed under its owner's session, but an in-flight one lands under
// whatever session is current when it finally arrives. Aborting closes
// that window rather than narrowing it.
//
// `work` is a PostgREST builder, or an array of them to run together.
// Passing a pre-made Promise.all() would defeat the point -- the array
// has to arrive unwrapped so each builder can be given the signal.
function withTimeout(work, ms) {
  const controller = new AbortController();
  // Guarded rather than assumed: `.abortSignal` is a PostgREST builder
  // method, and not everything passed through here is one. Anything else
  // still gets the timeout, just without cancellation.
  const attach = (q) => (q && typeof q.abortSignal === 'function') ? q.abortSignal(controller.signal) : q;
  const runnable = Array.isArray(work) ? Promise.all(work.map(attach)) : attach(work);

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, ms);
  });
  // clearTimeout on settle: without it every call leaves a live timer
  // behind, which keeps the event loop busy and delays anything waiting
  // for it to drain.
  return Promise.race([Promise.resolve(runnable), timeout]).finally(() => clearTimeout(timer));
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

  // Unowned items are excluded from `all` above, so without this they
  // would sit in IndexedDB invisible to every accessor -- getPendingCount
  // reporting 0 while rows are actually present is exactly how silent
  // data loss stays silent. Surfaced as a separate number rather than
  // folded into the total, because they are not this bowler's backlog
  // and must not be flushed as if they were.
  const unownedTotal = partitionQueue(await (await getDb()).getAll(STORE_NAME), getActiveUserId()).unowned.length;

  return { total: all.length, byTable, reasonsByTable, items: all, firstError, oldestAgeMs, unownedTotal };
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

// The columns a queued write was carrying, for the error log. Names
// only -- a payload's VALUES are bowler names, emails and ids.
function payloadColumns(payload) {
  try {
    const body = payload && typeof payload === 'object'
      ? (payload.changes || payload.match || payload)
      : null;
    if (!body || typeof body !== 'object') return '';
    const keys = Object.keys(body).sort();
    return keys.length ? ` [${keys.join(',')}]` : '';
  } catch { return ''; }
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
  const userId = getActiveUserId();
  // Queueing without an owner should not be possible: AuthGate does not
  // render the tracker without a session. If it happens anyway the write
  // is still kept -- discarding a bowler's game to keep the invariant
  // tidy would be the worse trade -- but it will not flush on its own,
  // so it must not do that quietly.
  if (!userId) console.warn(`sync queue: ${operation} on ${table} queued with no signed-in user; it will not flush until claimed`);
  // A queued write is a write that did not land. Recording it at the
  // one point every failure passes through catches the whole class --
  // RLS denials, timeouts, offline -- with the SQLSTATE that says which.
  // Column NAMES from the payload, never their values.
  //
  // `team_members.upsert / 42501` says a write was refused and nothing
  // about WHICH write -- creating a team, accepting an invite and
  // reordering a roster all land on that table, and they fail for
  // different reasons. The set of columns tells them apart at a glance.
  //
  // Names are schema, already in the repo. Values are bowlers' names and
  // ids and stay out, exactly as in the redaction rules.
  recordError({
    kind: 'write-failed', where: `${table}.${operation}`, code: errorCode || '',
    message: `${reason || ''}${payloadColumns(payload)}`,
  });
  await db.add(STORE_NAME, { table, operation, payload, reason, errorCode, onConflict, userId, createdAt: Date.now() });
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
    // A unique violation means the row is ALREADY in the cloud under this
    // key. Queueing it would queue a copy of something that arrived --
    // the flush would send it, get 23505 again, and drop it. That is a
    // round trip and a spurious "not synced" for data that is safe.
    //
    // Newly reachable: shots only gained a logical identity in step 35,
    // so re-importing the same scorecard now returns 23505 where it used
    // to create a second row.
    if (err?.code === '23505') {
      return { synced: true, queued: false, duplicate: true };
    }
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
// A write that changed nothing, reported as success.
//
// This is the failure this app keeps producing. With RLS on, a command
// with no matching policy is DENIED SILENTLY -- Postgres matches zero
// rows and returns no error, so the client sees success, updates local
// state, and the change reappears undone on the next sync. Three
// separate bugs of exactly this shape turned up in one day: deleting a
// team did nothing, editing a coaching note did not save, and a roster
// row could not be written by the person who had just created the team.
//
// `count: 'exact'` asks PostgREST how many rows it actually touched,
// without asking for the rows themselves -- so it does not depend on a
// SELECT policy permitting the caller to read them back, which for a
// just-deleted row is a rule nobody would think to write.
//
// A null count means the server did not tell us. That is NOT zero, and
// treating it as a failure would cry wolf on every backend that answers
// differently. Only a definite zero is reported.
function noteIfNothingChanged(table, operation, matchObj, count) {
  if (count !== 0) return;
  console.warn(`${operation} on ${table} matched no rows — likely denied by RLS`);
  recordError({
    kind: 'write-noop',
    where: `${table}.${operation}`,
    code: 'no-rows',
    // Column NAMES, never their values: a match object holds user ids
    // and bowler names.
    message: `matched 0 rows on ${Object.keys(matchObj || {}).sort().join(',') || '(no match)'}`,
  });
}

export async function cloudUpdate(table, match, changes, { timeoutMs = 6000 } = {}) {
  const matchObj = (typeof match === 'object' && match !== null) ? match : { id: match };
  try {
    let query = supabase.from(table).update(changes, { count: 'exact' });
    Object.entries(matchObj).forEach(([k, v]) => { query = query.eq(k, v); });
    const { error, count } = await withTimeout(query, timeoutMs);
    if (error) throw error;
    noteIfNothingChanged(table, 'update', matchObj, count);
    return { synced: true, queued: false, affected: count ?? null };
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
    let query = supabase.from(table).delete({ count: 'exact' });
    Object.entries(matchObj).forEach(([k, v]) => { query = query.eq(k, v); });
    const { error, count } = await withTimeout(query, timeoutMs);
    if (error) throw error;
    noteIfNothingChanged(table, 'delete', matchObj, count);
    return { synced: true, queued: false, affected: count ?? null };
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
    // Passed as an array, not Promise.all(...): withTimeout needs the
    // individual builders to attach the abort signal to each. Wrapping
    // them first would leave both requests running after a timeout.
    const [rowsRes, tombstonesRes] = await withTimeout([
      supabase.from(table).select('*').gte('updated_at', sinceIso),
      supabase.from('sync_tombstones').select('row_id,deleted_at')
        .eq('table_name', table).gte('deleted_at', sinceIso),
    ], timeoutMs);
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
      await db.put(STORE_NAME, { ...item, reason: formatError(err), errorCode: err?.code || item.errorCode || '' });

      const cls = classifySyncError(err);
      if (cls.kind === 'permanent') {
        // A permanent failure will fail identically forever. syncErrors
        // has said so since it was written -- "retrying forever just
        // wedges the queue" -- but this loop broke on EVERY error, so one
        // unsavable row blocked every write behind it indefinitely. A
        // bowler's whole night sitting behind a duplicate from last week.
        if (err?.code === '23505') {
          // A unique violation means the row is ALREADY in the cloud.
          // Keeping it queued is keeping a copy of something that
          // arrived, so it goes -- nothing is lost by dropping it.
          await db.delete(STORE_NAME, item.queueId);
        }
        // Anything else permanent stays queued and visible in the sync
        // panel, where it can be discarded deliberately. It is skipped
        // rather than dropped: a 42501 means the write never landed, and
        // silently binning a bowler's game to keep the queue tidy would
        // be the worse failure.
        // The columns too, and the actual error text.
        //
        // This entry is the one that REPEATS -- a permanently-failing item
        // is retried on every flush -- so it is the one most likely to be
        // read, and it was the least informative thing in the log:
        // "team_members.upsert / 42501 / permanent". Which of the four
        // writes that touch that table, and carrying what? Now it says.
        recordError({
          kind: 'write-failed', where: `${item.table}.${item.operation}`, code: err?.code || '',
          message: `permanent, skipped so it cannot wedge the queue — ${formatError(err)}${payloadColumns(item.payload)}`,
        });
        continue;
      }

      break; // transient: leave this item and everything after it queued, in order
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
