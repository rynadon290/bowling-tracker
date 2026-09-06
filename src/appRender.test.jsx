import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// A green build does NOT mean the app runs. A prop that references an
// undefined identifier compiles cleanly and then throws on first render --
// producing a black screen. This shipped once; this test exists so it
// can't ship again.
//
// It renders the entire tree, which is the only way to catch that class
// of mistake, since it's invisible to both the bundler and unit tests.

vi.mock('./supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async () => ({ error: null }),
      signOut: async () => {},
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

vi.mock('idb', () => ({
  openDB: async () => ({
    get: async () => null, put: async () => {}, delete: async () => {},
    getAll: async () => [], transaction: () => ({ store: {}, done: Promise.resolve() }),
  }),
}));

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:,' }, toDataURL: async () => 'data:,' }));

beforeAll(() => {
  globalThis.window = globalThis.window || {};
  globalThis.window.storage = {
    get: async () => null, set: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }),
  };
  globalThis.window.scrollTo = () => {};
});

describe('app renders', () => {
  it('mounts the whole tree without throwing', async () => {
    const { AuthProvider } = await import('./AuthProvider.jsx');
    const { default: BowlingTracker } = await import('./BowlingTracker.jsx');
    const html = renderToStaticMarkup(
      <AuthProvider><BowlingTracker /></AuthProvider>
    );
    expect(html.length).toBeGreaterThan(100);
  });
});
