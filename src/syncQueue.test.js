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

function resetDb() { dbState.store = []; dbState.nextId = 1; }
function delay(ms, value) { return new Promise(resolve => setTimeout(() => resolve(value), ms)); }

beforeEach(() => {
  resetDb();
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
    expect(result).toEqual({ synced: true, queued: false });
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
