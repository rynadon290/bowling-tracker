// A screen's code failed to download. Reload, or show the error?
//
// Every screen below the first is lazy-loaded, so its code arrives as a
// separate file named with a content hash. Deploy while someone has the
// app open and those files are replaced: the page in their hands still
// refers to the old names, which no longer exist. The next tab they open
// throws
//
//   Failed to fetch dynamically imported module: .../Settings-pB5coCaw.js
//
// and the screen never appears. It reads like a crash in that screen and
// it is nothing of the sort -- the code is simply gone. Reloading gets
// the current page, which names the current files, and everything works.
//
// This will keep happening. It is not an edge case: it is the normal
// consequence of deploying to anyone who has the app open, which after
// launch is the point.
//
// Pure: the caller supplies the clock and the last reload time.

// Reload at most once per window. Without this, a chunk that is missing
// for any OTHER reason -- a genuinely broken deploy, no signal, a proxy
// eating the request -- reloads forever, and an app stuck in a reload
// loop is worse than one showing an error. After the first attempt the
// error is allowed through to the boundary, which says something useful
// and keeps the nav alive.
export const RELOAD_WINDOW_MS = 10000;

// The message differs by browser -- Chrome says "Failed to fetch
// dynamically imported module", Safari "Importing a module script
// failed", Firefox "error loading dynamically imported module" -- so
// match on the shared shape rather than one vendor's wording.
//
// Deliberately narrow. A genuine TypeError thrown inside a screen's
// module body must NOT be mistaken for a missing chunk, or a real bug
// turns into an endless reload that hides itself.
export function isChunkLoadError(err) {
  if (!err) return false;
  const msg = String((err && err.message) || err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(msg);
}

export function shouldReload(lastReloadAt, now = Date.now(), windowMs = RELOAD_WINDOW_MS) {
  const last = Number(lastReloadAt);
  // No record of a previous attempt -- including a missing, empty or
  // unparseable value -- means this is the first, so reload.
  if (!Number.isFinite(last) || last <= 0) return true;
  const elapsed = now - last;
  // A clock that moved backwards (timezone change, manual adjustment)
  // gives a negative elapsed. Treat it as "recent" rather than "long
  // ago": refusing to reload is the safe direction, because the error
  // still reaches the boundary and the bowler sees something.
  if (elapsed < 0) return false;
  return elapsed > windowMs;
}
