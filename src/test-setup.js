// Test environment shims.
//
// The app reaches for browser APIs that jsdom does not implement, and for
// two Capacitor globals that only exist inside a native shell. Without
// these, tests fail on the environment rather than on the code, which
// teaches people to ignore failures.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount between tests so one test's DOM can't be found by the next.
afterEach(() => cleanup());

// The app's own key-value store, backed by window.storage in production.
const store = new Map();
window.storage = {
  get: async k => (store.has(k) ? { value: store.get(k) } : null),
  set: async (k, v) => { store.set(k, String(v)); },
  delete: async k => { store.delete(k); },
  list: async () => ({ keys: [...store.keys()] }),
};

// jsdom has no layout engine, so anything that scrolls is a no-op.
window.scrollTo = () => {};

// matchMedia is used for reduced-motion checks; jsdom omits it.
window.matchMedia = window.matchMedia || (q => ({
  matches: false, media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));

// Not running inside Capacitor. Tests that want the native path can
// override this per test.
window.Capacitor = undefined;
