import { describe, it, expect } from 'vitest';
import { isChunkLoadError, shouldReload, RELOAD_WINDOW_MS } from './chunkReload.js';

describe('isChunkLoadError', () => {
  // The real message, from a real deploy, on a real phone.
  it('recognises the Chrome wording', () => {
    expect(isChunkLoadError(new Error(
      'Failed to fetch dynamically imported module: https://rynadon290.github.io/bowling-tracker/assets/Settings-pB5coCaw.js'
    ))).toBe(true);
  });

  it('recognises the Safari and Firefox wordings', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  // The one that matters most. A genuine bug inside a screen's module
  // body must not be mistaken for a missing chunk, or it becomes an
  // endless reload that hides itself.
  it('does not mistake a real error for a missing chunk', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'length')"))).toBe(false);
    expect(isChunkLoadError(new Error('profiles is not defined'))).toBe(false);
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 0, '', {}, [], 42, false]) {
      expect(() => isChunkLoadError(junk)).not.toThrow();
      expect(isChunkLoadError(junk)).toBe(false);
    }
  });

  it('reads a bare string too', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
  });
});

describe('shouldReload', () => {
  it('reloads the first time', () => {
    expect(shouldReload(null, 1000)).toBe(true);
    expect(shouldReload(undefined, 1000)).toBe(true);
    expect(shouldReload('', 1000)).toBe(true);
    expect(shouldReload(0, 1000)).toBe(true);
  });

  // Without this the app reload-loops whenever a chunk is missing for
  // any other reason, and a loop is worse than an error message.
  it('refuses a second reload inside the window', () => {
    expect(shouldReload(1000, 1000 + RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(shouldReload(1000, 1000)).toBe(false);
  });

  it('allows another once the window has passed', () => {
    expect(shouldReload(1000, 1000 + RELOAD_WINDOW_MS + 1)).toBe(true);
  });

  // A phone crossing a timezone, or a manual clock change, gives a
  // negative elapsed. Not reloading is the safe direction: the error
  // still reaches the boundary and the bowler sees something.
  it('treats a backwards clock as recent, not ancient', () => {
    expect(shouldReload(5000, 1000)).toBe(false);
  });

  it('survives junk', () => {
    for (const junk of ['x', {}, [], NaN, Infinity]) {
      expect(() => shouldReload(junk, 1000)).not.toThrow();
    }
    expect(shouldReload('x', 1000)).toBe(true);
    expect(shouldReload(NaN, 1000)).toBe(true);
  });
});
