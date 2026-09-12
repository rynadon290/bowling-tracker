// What went wrong, kept locally, in a shape that is safe to read out.
//
// The bugs that hurt most in this app are the quiet ones. Deleting a team
// removed nothing and reported success. Editing a coaching note silently
// failed. Queued writes retried forever against a policy that would never
// accept them. Nobody would have reported any of those, because nothing
// looked wrong -- so the log has to catch the class of failure that never
// reaches a person, not just the crashes that do.
//
// Pure: no storage, no window, no dates of its own. The caller supplies
// `now`. Everything here can be tested without a browser.

// Small on purpose. This shares a ~5MB localStorage quota with the
// delta-sync caches, and the last 50 events answer "what just happened"
// as well as the last 5000 -- while an unbounded log is its own bug,
// filling the quota and breaking the writes it was meant to diagnose.
export const MAX_ENTRIES = 50;

// A closed list, so an entry cannot arrive with a kind nobody can
// filter on. Anything unrecognised becomes "unhandled" -- which is why
// the import kinds below had to be added here, not just used: without
// this line every import problem was silently filed as a generic
// unhandled error and became impossible to pick out.
//
// The import kinds are separated because they answer different
// questions. "failed" is the reader breaking; "empty" is a photo it
// could not use; "quality" is a photo it half-used; "score-mismatch" is
// a reading that contradicts itself. Lumping them together would hide
// which of those is actually happening to people.
export const KINDS = [
  "crash", "render", "write-failed", "write-noop", "unhandled",
  "import-failed", "import-empty", "import-quality", "import-score-mismatch",
];

// ── Redaction ───────────────────────────────────────────────────────────
//
// This is the part that has to be right, and it has to happen HERE, at
// record time -- not before a future upload.
//
// Postgres puts real values in its error text: a unique violation reads
// `Key (bowler_name)=(Maggie) already exists`. Those names belong to
// people who may never have installed this app and have agreed to
// nothing. Keeping them in a log Ryan pastes into a chat window is the
// same mistake as putting them in a database column, just less visible.
//
// So: keep the SHAPE of an error, drop the values. Column names, table
// names and SQLSTATE codes are what make a message diagnosable; the
// values almost never are.
export function redact(message) {
  if (typeof message !== "string") return "";
  return message
    // Key (bowler_name)=(Maggie) -> Key (bowler_name)=(*)
    // The column name survives; only the VALUE goes.
    .replace(/\)=\([^)]*\)/g, ")=(*)")
    // Single-quoted literals are values: 'Maggie', 'tuesday night'.
    .replace(/'[^']*'/g, "'*'")
    // DOUBLE-quoted text in a Postgres error is an IDENTIFIER, not a
    // value -- a column, table or constraint name. Blanking those made
    // real errors unreadable: `null value in column "*" of relation "*"`
    // says something is null somewhere, which is no help at all. Names
    // are schema, and the schema is already in the repo.
    //
    // Emails are stripped below wherever they appear, so an address that
    // turns up inside quotes is still removed.
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "*@*")
    // UUIDs are safe to keep -- they identify a row without naming
    // anyone, and they are how you find it again.
    .slice(0, 300);
}

// A stable fingerprint for "the same thing going wrong again", so a
// render loop produces one entry with a count of 400 rather than 400
// entries that push everything useful out of the buffer.
export function signatureOf(entry) {
  const e = (entry && typeof entry === "object") ? entry : {};
  return [e.kind || "?", e.where || "?", e.code || "", redact(e.message || "")].join("|");
}

// ── Entries ─────────────────────────────────────────────────────────────

export function makeEntry(input, now = Date.now()) {
  const i = (input && typeof input === "object") ? input : {};
  return {
    kind: KINDS.includes(i.kind) ? i.kind : "unhandled",
    // Which screen or table, never what was in it.
    where: typeof i.where === "string" ? i.where.slice(0, 60) : "",
    // SQLSTATE, HTTP status, or an app reason. Short and safe.
    code: typeof i.code === "string" ? i.code.slice(0, 20) : "",
    message: redact(i.message),
    // Which build. The Settings chunk failure earlier today was a stale
    // bundle, and this field alone identifies that in one glance.
    build: typeof i.build === "string" ? i.build.slice(0, 40) : "",
    first: now,
    last: now,
    count: 1,
  };
}

// Adds an entry, merging into an identical one rather than appending.
// Returns a NEW array -- callers persist whatever comes back.
export function addEntry(entries, input, now = Date.now()) {
  const list = Array.isArray(entries) ? entries.filter(e => e && typeof e === "object") : [];
  const entry = makeEntry(input, now);
  const sig = signatureOf(entry);

  const existing = list.find(e => signatureOf(e) === sig);
  if (existing) {
    // Mutating a copy, not the caller's array.
    const merged = { ...existing, last: now, count: (existing.count || 1) + 1 };
    return [merged, ...list.filter(e => e !== existing)].slice(0, MAX_ENTRIES);
  }
  return [entry, ...list].slice(0, MAX_ENTRIES);
}

// ── Reading it out ──────────────────────────────────────────────────────
//
// Formatted for pasting into a chat. Newest first, because the thing that
// just happened is the thing being asked about.
export function formatForCopy(entries, meta = {}) {
  const list = Array.isArray(entries) ? entries.filter(e => e && typeof e === "object") : [];
  const head = [
    "My Bowling Vault — diagnostics",
    meta.build ? `build: ${meta.build}` : "",
    meta.generated ? `generated: ${meta.generated}` : "",
    `entries: ${list.length}`,
    "",
  ].filter(Boolean);

  if (!list.length) return head.concat(["No errors recorded."]).join("\n");

  const body = list.map(e => {
    const when = new Date(e.last || e.first || 0).toISOString().replace("T", " ").slice(0, 19);
    const times = (e.count || 1) > 1 ? ` x${e.count}` : "";
    return [
      `${when}  ${e.kind}${times}`,
      e.where ? `  where: ${e.where}` : "",
      e.code ? `  code: ${e.code}` : "",
      e.message ? `  ${e.message}` : "",
    ].filter(Boolean).join("\n");
  });

  return head.concat(body).join("\n");
}

// How many distinct problems, and how many events in total. The badge
// shows distinct -- 400 repeats of one bug is one problem, and showing
// 400 makes it look like forty.
export function summarise(entries) {
  const list = Array.isArray(entries) ? entries.filter(e => e && typeof e === "object") : [];
  return {
    distinct: list.length,
    total: list.reduce((n, e) => n + (e.count || 1), 0),
    newest: list.reduce((t, e) => Math.max(t, e.last || e.first || 0), 0) || null,
  };
}
