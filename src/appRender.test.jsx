// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { APP_NAME } from './constants.js';

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
  // The first-launch gate decides which of two trees renders, and it reads
  // its flag synchronously from localStorage so the choice is made on the
  // first paint. Both branches need covering: with only the default mock
  // (getItem -> null) this suite would render the onboarding screen and
  // quietly stop smoke-testing the main app at all.
  it('mounts the whole tree without throwing, for a returning bowler', async () => {
    globalThis.window.localStorage.getItem = key =>
      (key === 'bowling-onboarded-v1' ? '1' : null);
    const { AuthProvider } = await import('./AuthProvider.jsx');
    const { default: BowlingTracker } = await import('./BowlingTracker.jsx');
    const html = renderToStaticMarkup(
      <AuthProvider><BowlingTracker /></AuthProvider>
    );
    expect(html.length).toBeGreaterThan(100);
    // Proves it really is the app shell and not the onboarding screen.
    // Asserts the wordmark renders, not what it says -- pinning the
    // literal name meant a rename broke a test that isn't about naming.
    expect(html).toContain(APP_NAME.replace(/&/g, '&amp;'));
  });

  it('mounts the first-launch flow without throwing, for a new bowler', async () => {
    globalThis.window.localStorage.getItem = () => null;
    const { AuthProvider } = await import('./AuthProvider.jsx');
    const { default: BowlingTracker } = await import('./BowlingTracker.jsx');
    const html = renderToStaticMarkup(
      <AuthProvider><BowlingTracker /></AuthProvider>
    );
    expect(html.length).toBeGreaterThan(100);
    // The first onboarding screen asks who's bowling -- name, hand and
    // style -- before the environment question that used to be first.
    // Anchored on "Which hand?" rather than the heading because the
    // heading contains an apostrophe, which server rendering escapes to
    // &#x27; and would make this assertion fail for the wrong reason.
    expect(html).toContain('Which hand?');
  });
});
