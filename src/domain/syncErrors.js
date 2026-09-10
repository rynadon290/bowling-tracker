// How a failed sync is described to a bowler.
//
// Pure logic, kept out of syncQueue.js so it can actually be tested --
// importing that module drags in IndexedDB, which is why this was
// excluded from the test run and why a broken timeout match went
// unnoticed.

const TRANSIENT_CODES = new Set([
  "08000", "08003", "08006", // connection failures
  "53300", "57014",          // too many connections, query cancelled
  "40001", "40P01",          // serialisation failure, deadlock
]);

// Errors that will NEVER pass by retrying, because the data itself
// conflicts with a rule. Retrying forever just wedges the queue.
const PERMANENT_CODES = new Set([
  "23505", // unique violation
  "23503", // foreign key violation
  "23502", // not-null violation
  "23514", // check constraint
  "42501", // insufficient privilege (RLS/grant)
  "22P02", // invalid text representation
]);

export function classifySyncError(err) {
  const code = err?.code || "";
  const msg = String(err?.message || "");

  // "timed out" does not match /timeout/ -- the word is split, and that
  // is how browsers and Postgres actually phrase it ("The operation
  // timed out", "ETIMEDOUT", "statement timeout"). A real alley-wifi
  // timeout was therefore classed as a PERMANENT failure and the bowler
  // was told something had gone wrong rather than "this will upload on
  // its own".
  //
  // Also covers offline, connection-refused and DNS wording, which are
  // the same situation from the bowler's point of view.
  if (TRANSIENT_CODES.has(code) ||
      /fetch|network|time[\s-]?d?\s?out|timeout|abort|offline|disconnect|refused|unreachable|dns|ECONN|ETIMEDOUT|ENOTFOUND|ERR_INTERNET|ERR_NETWORK|502|503|504/i.test(msg)) {
    return {
      kind: "transient",
      // No action: the queue retries automatically.
      title: "Waiting for a better connection",
      detail: "Your scores are saved on this phone and will upload on their own.",
      canRetry: true,
      canDiscard: false,
    };
  }

  if (code === "23505") {
    return {
      kind: "permanent",
      title: "Something was already saved",
      detail: "This looks like a duplicate of something already in the cloud. Your scores are safe — this copy just isn't needed.",
      canRetry: true,
      canDiscard: true,
    };
  }

  if (code === "42501") {
    return {
      kind: "permanent",
      title: "Not allowed to save this",
      detail: "The app doesn't have permission to save this. Nothing is lost on this phone, but it can't reach the cloud until this is fixed.",
      canRetry: true,
      canDiscard: false, // needs a real fix, not a discard
    };
  }

  if (PERMANENT_CODES.has(code)) {
    return {
      kind: "permanent",
      title: "This didn't save correctly",
      detail: "Something about this entry doesn't fit what the cloud expects. Your scores are still on this phone.",
      canRetry: true,
      canDiscard: true,
    };
  }

  return {
    kind: "unknown",
    title: "Couldn't upload yet",
    detail: "Your scores are saved on this phone. The app keeps trying in the background.",
    canRetry: true,
    canDiscard: true,
  };
}

// Whether the bowler needs to be told anything at all.
//
// A transient failure with a small backlog is just normal life at a
// bowling alley with bad wifi -- surfacing it would train people to
// ignore the indicator. Speak up when it's stuck, not when it's slow.
export function shouldSurfaceSyncIssue(state) {
  // A default parameter only applies to `undefined`, not `null` -- and
  // "no queue state yet" is naturally expressed as null by a caller
  // reading it from storage before the first sync.
  const { total = 0, oldestAgeMs = 0, kind = "unknown" } =
    (state && typeof state === "object") ? state : {};
  if (total === 0) return false;
  if (kind === "permanent") return true;
  // Transient and recent: stay quiet, it's working.
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  return oldestAgeMs > TWO_HOURS;
}
