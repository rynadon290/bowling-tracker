import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory fake for idb's openDB — just enough surface to back the one
// object store syncQueue.js uses (pending_writes, keyed by autoincrement
// queueId). vi.hoisted lets this state be reset between tests even though
// the vi.mock factory below is hoisted above these declarations.
const dbState = vi.hoisted(() => ({ store: [], nextId: 1 }));

vi.mock('idb', () => ({
  openDB: async () => ({
    async add(_storeName, value) {
      const queueId = dbState.nextId++;
      dbState.store.push({ ...value, queueId });
      return queueId;
    },
    async put(_storeName, value) {
      const idx = dbState.store.findIndex(item => item.queueId === value.queueId);
      if (idx >= 0) dbState.store[idx] = value;
      else dbState.store.push(value);
      return value.queueId;
    },
    async getAll() {
      return [...dbState.store];
    },
    async delete(_storeName, queueId) {
      dbState.store = dbState.store.filter(item => item.queueId !== queueId);
    },
    async count() {
      return dbState.store.length;
    },
  }),
}));

// Configurable fake Supabase client. Each test sets `supabaseState.upsert`/
// `.delete` to whatever behavior it wants to exercise (fast success, slow
// timeout, immediate error).
const supabaseState = vi.hoisted(() => ({
  upsert: async () => ({ error: null }),
  delete: async () => ({ error: null }),
}));

vi.mock('./supabaseClient.js', () => ({
  supabase: {
    from: (table) => ({
      upsert: (record) => supabaseState.upsert(table, record),
      delete: () => {
        const filters = {};
        const query = {
          eq(k, v) { filters[k] = v; return query; },
          then(resolve, reject) { supabaseState.delete(table, filters).then(resolve, reject); },
        };
        return query;
      },
    }),
  },
}));

const { cloudWrite, cloudDelete, flushPendingQueue, getPendingCount } = await import('./syncQueue.js');
const { setActiveUserId } = await import('./domain/userScope.js');

function resetDb() { dbState.store = []; dbState.nextId = 1; }
function delay(ms, value) { return new Promise(resolve => setTimeout(() => resolve(value), ms)); }

beforeEach(() => {
  resetDb();
  // The queue is user-scoped: every item records who queued it, and
  // nothing is counted or flushed for anyone else. Without a signed-in
  // user there is no owner to stamp, so writes queue but are not this
  // user's backlog -- which is the point, and which made every count
  // assertion below read zero until this line existed.
  setActiveUserId('test-user');
  supabaseState.upsert = async () => ({ error: null });
  supabaseState.delete = async () => ({ error: null });
});

describe('cloudWrite', () => {
  it('a fast successful write is not queued', async () => {
    const result = await cloudWrite('shots', { id: 'a' }, { timeoutMs: 100 });
    expect(result).toEqual({ synced: true, queued: false });
    expect(await getPendingCount()).toBe(0);
  });

  it('a write that hangs past the timeout falls back to the queue', async () => {
    supabaseState.upsert = () => delay(500, { error: null });
    const result = await cloudWrite('shots', { id: 'b' }, { timeoutMs: 50 });
    expect(result.synced).toBe(false);
    expect(result.queued).toBe(true);
    expect(await getPendingCount()).toBe(1);
  });

  it('an immediate error (offline) queues right away, without waiting out the full timeout', async () => {
    supabaseState.upsert = async () => { throw new Error('network error'); };
    const start = Date.now();
    const result = await cloudWrite('shots', { id: 'c' }, { timeoutMs: 5000 });
    const elapsed = Date.now() - start;
    expect(result.queued).toBe(true);
    expect(elapsed).toBeLessThan(1000); // nowhere near the 5s timeout
  });
});

describe('cloudDelete', () => {
  it('a fast successful delete is not queued', async () => {
    const result = await cloudDelete('shots', 'some-id', { timeoutMs: 100 });
    // `affected` is how many rows the delete actually touched. It is here
    // because RLS denies a command with no matching policy SILENTLY --
    // zero rows, no error -- and that is how deleting a team appeared to
    // work for months while changing nothing.
    //
    // null, not 0: this mock does not report a count, and an unknown
    // count must never be read as "nothing happened" or every backend
    // that answers differently looks like a silent failure.
    expect(result).toEqual({ synced: true, queued: false, affected: null });
  });

  it('reports how many rows a delete actually removed', async () => {
    supabaseState.delete = async () => ({ error: null, count: 0 });
    const result = await cloudDelete('shots', 'some-id', { timeoutMs: 100 });
    // Still "synced" -- PostgREST did not error, and pretending otherwise
    // would queue a retry that fails the same way forever.
    expect(result.synced).toBe(true);
    expect(result.affected).toBe(0);
  });

  it('accepts a composite match object for tables without a single id column', async () => {
    let capturedFilters = null;
    supabaseState.delete = async (_table, filters) => { capturedFilters = filters; return { error: null }; };
    await cloudDelete('team_members', { team_id: 'team-1', user_id: 'user-1' }, { timeoutMs: 100 });
    expect(capturedFilters).toEqual({ team_id: 'team-1', user_id: 'user-1' });
  });

  it('falls back to the queue on failure, preserving the match object as the payload', async () => {
    supabaseState.delete = async () => { throw new Error('offline'); };
    await cloudDelete('team_members', { team_id: 'team-1', user_id: 'user-1' }, { timeoutMs: 50 });
    expect(await getPendingCount()).toBe(1);
  });
});

describe('flushPendingQueue', () => {
  it('processes queued items in order and removes them on success', async () => {
    supabaseState.upsert = async () => { throw new Error('offline'); };
    await cloudWrite('shots', { id: 'x' }, { timeoutMs: 50 });
    await cloudWrite('shots', { id: 'y' }, { timeoutMs: 50 });
    expect(await getPendingCount()).toBe(2);

    supabaseState.upsert = async () => ({ error: null }); // back online
    await flushPendingQueue();
    expect(await getPendingCount()).toBe(0);
  });

  it('stops at the first failure, preserving order rather than skipping ahead', async () => {
    supabaseState.upsert = async () => { throw new Error('offline'); };
    await cloudWrite('shots', { id: 'x' }, { timeoutMs: 50 });
    await cloudWrite('shots', { id: 'y' }, { timeoutMs: 50 });
    await cloudWrite('shots', { id: 'z' }, { timeoutMs: 50 });

    const attempted = [];
    supabaseState.upsert = async (_table, record) => {
      attempted.push(record.id);
      if (record.id === 'y') throw new Error('still offline for this one');
      return { error: null };
    };
    await flushPendingQueue();

    expect(attempted).toEqual(['x', 'y']); // never reaches z
    expect(await getPendingCount()).toBe(2); // y and z both still queued
  });
});

// The cross-account bug, at the unit level. A logs a shot offline, signs
// out, B signs in, the 30-second flush timer fires -- and A's shot used
// to land in B's account and be deleted from the queue on success, so A
// did not merely leak it, A lost it.
describe('user scoping', () => {
  it('does not flush one user\'s queued writes through another user\'s session', async () => {
    supabaseState.upsert = async () => { throw new Error('offline'); };
    setActiveUserId('bowler-a');
    await cloudWrite('shots', { id: 'a-shot' }, { timeoutMs: 50 });
    expect(await getPendingCount()).toBe(1);

    const attempted = [];
    supabaseState.upsert = async (_table, record) => { attempted.push(record.id); return { error: null }; };

    setActiveUserId('bowler-b'); // A signs out, B signs in
    expect(await getPendingCount()).toBe(0); // not B's backlog
    await flushPendingQueue();
    expect(attempted).toEqual([]); // nothing sent under B's session

    setActiveUserId('bowler-a'); // A comes back
    expect(await getPendingCount()).toBe(1); // still theirs, not lost
    await flushPendingQueue();
    expect(attempted).toEqual(['a-shot']);
    expect(await getPendingCount()).toBe(0);
  });

  it('flushes nothing at all when signed out', async () => {
    supabaseState.upsert = async () => { throw new Error('offline'); };
    setActiveUserId('bowler-a');
    await cloudWrite('shots', { id: 'a-shot' }, { timeoutMs: 50 });

    const attempted = [];
    supabaseState.upsert = async (_table, record) => { attempted.push(record.id); return { error: null }; };
    setActiveUserId(null);
    await flushPendingQueue();
    expect(attempted).toEqual([]);
  });

  it('counts only the current user\'s backlog', async () => {
    supabaseState.upsert = async () => { throw new Error('offline'); };
    setActiveUserId('bowler-a');
    await cloudWrite('shots', { id: 'a1' }, { timeoutMs: 50 });
    await cloudWrite('shots', { id: 'a2' }, { timeoutMs: 50 });
    setActiveUserId('bowler-b');
    await cloudWrite('shots', { id: 'b1' }, { timeoutMs: 50 });

    expect(await getPendingCount()).toBe(1);
    setActiveUserId('bowler-a');
    expect(await getPendingCount()).toBe(2);
  });
});
