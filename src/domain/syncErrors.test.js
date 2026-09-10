import { describe, it, expect } from 'vitest';
import { classifySyncError, shouldSurfaceSyncIssue } from './syncErrors.js';

// syncQueue is excluded from the main runner (vi.mock hoisting), so
// this logic had never been under test — and it's what protects a
// bowler's night when the alley wifi drops, which is most alleys.
describe('classifySyncError', () => {
  // "timed out" does not match /timeout/ — the word is split, and that
  // is exactly how browsers and Postgres phrase it. A real timeout was
  // therefore reported as a permanent failure, telling a bowler
  // something had gone wrong when it hadn't.
  it('treats every real network wording as transient', () => {
    for (const msg of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'The operation timed out',
      'ETIMEDOUT',
      'statement timeout',
      'net::ERR_INTERNET_DISCONNECTED',
      'connection refused',
      '503 Service Unavailable',
    ]) {
      expect(classifySyncError({ message: msg }).kind).toBe('transient');
    }
  });

  it('reassures rather than alarms when offline', () => {
    const c = classifySyncError({ message: 'Failed to fetch' });
    expect(c.detail).toMatch(/saved on this phone|will upload/i);
    expect(c.canDiscard).toBe(false);
  });

  it('still treats genuine failures as permanent', () => {
    expect(classifySyncError({ code: '23505', message: 'duplicate key' }).kind).toBe('permanent');
    expect(classifySyncError({ message: 'permission denied' }).kind).not.toBe('transient');
  });

  it('always returns something showable', () => {
    for (const err of [null, undefined, {}, 'a string', 42, new Error('boom')]) {
      const c = classifySyncError(err);
      expect(typeof c.kind).toBe('string');
      expect(c.title).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });
});

describe('shouldSurfaceSyncIssue', () => {
  // A default parameter applies to undefined, not null — and "no queue
  // state yet" is naturally null when read from storage before the
  // first sync.
  it('does not throw on null', () => {
    expect(() => shouldSurfaceSyncIssue(null)).not.toThrow();
    expect(shouldSurfaceSyncIssue(null)).toBe(false);
  });

  it('stays quiet during a brief blip', () => {
    expect(shouldSurfaceSyncIssue({ total: 3, oldestAgeMs: 60_000, kind: 'transient' })).toBe(false);
  });

  it('speaks up when something is genuinely stuck', () => {
    expect(shouldSurfaceSyncIssue({ total: 1, oldestAgeMs: 3 * 60 * 60 * 1000, kind: 'transient' })).toBe(true);
    expect(shouldSurfaceSyncIssue({ total: 1, kind: 'permanent' })).toBe(true);
  });

  it('says nothing when the queue is empty', () => {
    expect(shouldSurfaceSyncIssue({ total: 0, kind: 'permanent' })).toBe(false);
  });
});
