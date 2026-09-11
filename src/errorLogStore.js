// Persists the error log and installs the global handlers.
//
// The pure logic -- redaction, dedup, formatting -- lives in
// domain/errorLog.js and is tested there. This file is only the parts
// that need a browser: storage, window handlers, and working out which
// build is running.
import { addEntry, formatForCopy, summarise } from "./domain/errorLog.js";

// Scoped per user by the storage wrapper, like every other key. One
// bowler's errors are not another's, and on a shared phone they should
// not be readable across accounts any more than their scores are.
const ERROR_LOG_KEY = "bowling-error-log-v1";

let installed = false;

// Which build is running. Vite emits hashed filenames, so the script src
// identifies the bundle exactly -- and a stale-chunk failure like the
// Settings one is obvious the moment two different hashes show up in the
// same log.
export function buildId() {
  if (typeof document === "undefined") return "";
  try {
    const el = document.querySelector('script[src*="assets/"]');
    if (!el) return "";
    return (el.getAttribute("src") || "").split("/").pop() || "";
  } catch { return ""; }
}

async function readRaw() {
  if (typeof window === "undefined" || !window.storage) return [];
  try {
    const row = await window.storage.get(ERROR_LOG_KEY);
    if (!row) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Records one event. Deliberately never throws and never returns a
// rejected promise: an error logger that can itself fail loudly turns a
// small problem into a crash, and it is called from inside crash
// handlers.
export async function recordError(input) {
  try {
    if (typeof window === "undefined" || !window.storage) return;
    const next = addEntry(await readRaw(), { ...input, build: buildId() }, Date.now());
    await window.storage.set(ERROR_LOG_KEY, JSON.stringify(next));
  } catch { /* nothing to do -- see above */ }
}

export async function readErrorLog() {
  return readRaw();
}

export async function errorLogSummary() {
  return summarise(await readRaw());
}

export async function errorLogText() {
  return formatForCopy(await readRaw(), {
    build: buildId(),
    generated: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
}

export async function clearErrorLog() {
  try {
    if (typeof window === "undefined" || !window.storage) return;
    await window.storage.delete(ERROR_LOG_KEY);
  } catch { /* nothing to do */ }
}

// Catches what never reaches a component: errors thrown outside React's
// render path, and promise rejections nobody handled. ErrorBoundary only
// sees the first kind, and only during render.
export function installErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    recordError({
      kind: "unhandled",
      where: "window",
      message: e?.error?.message || e?.message || "",
      // A failed dynamic import names the chunk it could not fetch,
      // which is exactly the stale-deploy signature.
      code: e?.filename ? String(e.filename).split("/").pop().slice(0, 20) : "",
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e?.reason;
    recordError({
      kind: "unhandled",
      where: "promise",
      message: (r && r.message) || String(r || ""),
      code: (r && r.code) || "",
    });
  });
}
