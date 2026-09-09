// Test environment shims.
//
// This file runs for EVERY test file. Most use the fast `node`
// environment and have no DOM at all -- only the three that declare
// `@vitest-environment jsdom` do. So everything here is guarded:
// touching `window` unconditionally throws before a single domain test
// can run, which is exactly what happened when this guard was missing.
//
// The jsdom-only imports use top-level await deliberately. Importing
// @testing-library/react at module scope would load it for all 40 files,
// which is most of the cost that moving to `node` was meant to avoid.
const hasDom = typeof globalThis.window !== "undefined";

if (hasDom) {
  await import("@testing-library/jest-dom/vitest");
  const { afterEach } = await import("vitest");
  const { cleanup } = await import("@testing-library/react");

  // Unmount between tests so one test's DOM can't be found by the next.
  afterEach(() => cleanup());

  // The app's own key-value store, backed by window.storage in
  // production.
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
}
