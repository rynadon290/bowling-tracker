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

// The app runs in a browser; this environment is 'node'. Several modules
// feature-detect with `typeof window !== 'undefined'` and then call browser
// APIs -- syncQueue.js registers an 'online' listener at module load, for
// one. A partial window stub is worse than none: it passes the guard and
// then throws on the missing method. So this provides every browser API the
// tree actually touches during a render.
beforeAll(() => {
  const listeners = [];
  globalThis.window = {
    ...(globalThis.window || {}),
    storage: {
      get: async () => null, set: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }),
    },
    scrollTo: () => {},
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: () => {},
    location: { origin: 'http://localhost', pathname: '/' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    // BowlingTracker falls back to localStorage when window.storage is
    // absent; Friends and TeamManagement use confirm() for destructive
    // actions. Neither fires during a plain render, but a missing global
    // would throw if that ever changes.
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    confirm: () => false,
  };
  // navigator is a read-only getter in Node, so assigning it directly
  // throws. Node already provides one; only define it if truly absent.
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true }, configurable: true, writable: true,
    });
  }
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
