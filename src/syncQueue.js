import { openDB } from 'idb';
import { supabase } from './supabaseClient.js';

// Requires the `idb` package (a small, standard Promise wrapper around the
// browser's IndexedDB API): npm install idb

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

export async function getPendingCount() {
  const db = await getDb();
  return db.count(STORE_NAME);
}

async function queueWrite(table, operation, payload) {
  const db = await getDb();
  await db.add(STORE_NAME, { table, operation, payload, createdAt: Date.now() });
  notifyListeners(await getPendingCount());
}

// Every pending record still needs a stable id the UI can reference before
// it's ever reached Supabase — so callers of cloudWrite must generate the
// id client-side (crypto.randomUUID()) and include it in `record`, rather
// than relying on Supabase's default gen_random_uuid(). That's also what
// makes retries safe: the same id every time means upsert (not insert) is
// the right call below, so a write that actually succeeded right as the
// timeout fired doesn't turn into a duplicate-key error on retry.
export async function cloudWrite(table, record, { timeoutMs = 6000 } = {}) {
  try {
    const { error } = await withTimeout(
      supabase.from(table).upsert(record),
      timeoutMs
    );
    if (error) throw error;
    return { synced: true, queued: false };
  } catch (err) {
    await queueWrite(table, 'upsert', record);
    return { synced: false, queued: true, reason: err.message };
  }
}

export async function cloudDelete(table, id, { timeoutMs = 6000 } = {}) {
  try {
    const { error } = await withTimeout(
      supabase.from(table).delete().eq('id', id),
      timeoutMs
    );
    if (error) throw error;
    return { synced: true, queued: false };
  } catch (err) {
    await queueWrite(table, 'delete', { id });
    return { synced: false, queued: true, reason: err.message };
  }
}

// Returns any not-yet-synced records queued for a given table, so a read
// (e.g. loading shot history) can merge them in — otherwise a shot logged
// while offline would be invisible until the queue actually flushes.
export async function getQueuedRecordsForTable(table) {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  return all.filter((item) => item.table === table && item.operation === 'upsert').map((item) => item.payload);
}

// Flushes the queue in the order items were added. Stops at the first
// failure rather than skipping ahead — a later write can depend on an
// earlier one already existing (e.g. editing a shot that hasn't synced
// yet), so preserving order matters more than clearing whatever happens to
// succeed fastest.
export async function flushPendingQueue() {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);

  for (const item of all) {
    try {
      const { error } = item.operation === 'delete'
        ? await supabase.from(item.table).delete().eq('id', item.payload.id)
        : await supabase.from(item.table).upsert(item.payload);
      if (error) throw error;
      await db.delete(STORE_NAME, item.queueId);
    } catch {
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
