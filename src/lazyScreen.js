// React.lazy that survives a deploy happening while the app is open.
//
// Every screen below the first loads as its own content-hashed file. Ship
// a new build and those files are replaced; a page already open still
// asks for the old names, gets a 404, and the screen never appears. The
// bowler sees "Failed to fetch dynamically imported module" and, as far
// as they are concerned, the app is broken.
//
// It looks like a crash in that screen. It is not: the code is simply no
// longer there. Reloading fetches the current page, which names the
// current files, and everything works again.
//
// The decision logic lives in domain/chunkReload.js so it can be tested
// without a browser. This file is only the parts that need one.
import { lazy } from "react";
import { isChunkLoadError, shouldReload } from "./domain/chunkReload.js";
import { recordError } from "./errorLogStore.js";

// sessionStorage, not a module variable: the value has to survive the
// reload it triggers, or the loop guard guards nothing. Scoped to the
// tab, so it clears itself when the app is closed.
const RELOAD_KEY = "bowling-chunk-reload-at";

function lastReloadAt() {
  try { return Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { return 0; }
}

function markReloaded(now) {
  try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch { /* private mode */ }
}

export function lazyScreen(name, loader) {
  return lazy(() => loader().catch((err) => {
    if (!isChunkLoadError(err)) throw err;

    const now = Date.now();
    if (!shouldReload(lastReloadAt(), now)) {
      // Already tried. Something else is wrong -- a broken deploy, no
      // signal, a proxy eating the request -- and reloading again would
      // spin forever. Let it reach the error boundary, which says
      // something useful and keeps the nav alive.
      throw err;
    }

    markReloaded(now);
    // Fire and forget. The page is about to go away, so this may not
    // finish -- but when it does, two build hashes in one log is the
    // signature that says "deploy, not bug".
    recordError({ kind: "unhandled", where: `chunk:${name}`, code: "stale-chunk", message: String(err?.message || err) });

    try { window.location.reload(); } catch { /* nothing else to try */ }

    // Never resolves. React must not render a fallback or an error while
    // the page is being replaced -- a flash of "this screen hit a
    // problem" immediately before a reload is worse than a blank moment.
    return new Promise(() => {});
  }));
}
