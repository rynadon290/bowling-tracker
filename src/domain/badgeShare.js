// Sharing a night with the people you bowled it with.
//
// THE PROBLEM. One phone keeps score for everyone. That phone has three
// bowlers' nights on it; the other two have nothing. Their badges exist
// and are computable — they just have no way to reach them.
//
// THE APPROACH. Send the NIGHTS, not the badges, in a link. The payload
// travels with the person, so there is no record to claim, no name to
// match, and nothing on a server.
//
// Why nights rather than badges, which was the obvious first idea:
//
//   IDEMPOTENT.  Merging is by date, so loading the same link twice
//                changes nothing. Badge counts would silently double.
//   SELF-CORRECTING. Add a 23rd badge next month and every imported
//                night earns it retroactively. Encoded badges are frozen
//                at whatever the rules were the night they were sent.
//   SMALLER.     A night is a date and a few numbers.
//
// NOT VERIFIED, and deliberately so. Anyone can craft a link claiming a
// 300 game. These are bragging rights between friends who were there;
// making them tamper-proof means a server, which is the entire thing this
// design avoids. Nobody should later mistake an imported night for a
// scored one.

// A short, dense, URL-safe encoding. Not encryption -- just a compact
// shape that survives a text message.
//
// Dates are stored as days since 2020-01-01 so a date costs four
// characters rather than ten, which matters when the whole payload has to
// fit in a link somebody taps on a phone.
const EPOCH = Date.UTC(2020, 0, 1);
const DAY = 86400000;

export const SHARE_VERSION = 1;

function toDayNumber(date) {
  // Parsed at MIDNIGHT UTC, to match the epoch.
  //
  // Parsing at midday put every date half a day past the epoch boundary,
  // so Math.round pushed roughly half of them forward by one. Every
  // shared night arrived a day late, and merging then failed to match a
  // night the receiver already had.
  const t = Date.parse(String(date) + "T00:00:00Z");
  if (Number.isNaN(t)) return null;
  return Math.round((t - EPOCH) / DAY);
}

function fromDayNumber(n) {
  const d = new Date(EPOCH + Number(n) * DAY);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ── Encoding ────────────────────────────────────────────────────────────

// One bowler's nights, ready to hand over.
//
// Only THEIR scores travel. The person receiving this did not bowl
// anyone else's games, and sending the whole scoresheet would hand over
// other people's numbers to someone who never asked for them.
export function buildSharePayload(bowler, nights) {
  const name = typeof bowler === "string" ? bowler.trim() : "";
  if (!name) return null;

  const list = (Array.isArray(nights) ? nights : [])
    .filter(n => n && typeof n === "object");

  const mine = [];
  for (const night of list) {
    const scores = (night.scoresByBowler || {})[name];
    if (!Array.isArray(scores)) continue;
    const games = scores
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v >= 0 && v <= 300);
    if (!games.length) continue;
    const day = toDayNumber(night.date);
    if (day === null) continue;
    mine.push([day, games]);
  }

  if (!mine.length) return null;
  return { v: SHARE_VERSION, n: name, d: mine };
}

export function encodeShare(payload) {
  if (!payload || typeof payload !== "object") return "";
  try {
    const json = JSON.stringify(payload);
    // Base64url: the standard alphabet's + / = do not survive a URL.
    const b64 = typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf8").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch { return ""; }
}

export function decodeShare(code) {
  if (typeof code !== "string" || !code.trim()) return null;
  try {
    const b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function"
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, "base64").toString("utf8");
    const p = JSON.parse(json);
    if (!p || typeof p !== "object") return null;
    // A future version may carry a shape this build cannot read. Refusing
    // is right; guessing would import something wrong and look like it
    // worked.
    if (Number(p.v) !== SHARE_VERSION) return null;
    if (typeof p.n !== "string" || !p.n.trim()) return null;
    if (!Array.isArray(p.d)) return null;
    return p;
  } catch { return null; }
}

// ── Reading it back into nights ─────────────────────────────────────────

export function nightsFromPayload(payload, asBowler) {
  if (!payload || !Array.isArray(payload.d)) return [];
  const name = (typeof asBowler === "string" && asBowler.trim())
    ? asBowler.trim()
    : String(payload.n || "").trim();
  if (!name) return [];

  const out = [];
  for (const row of payload.d) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const date = fromDayNumber(row[0]);
    if (!date) continue;
    const games = (Array.isArray(row[1]) ? row[1] : [])
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v >= 0 && v <= 300);
    if (!games.length) continue;
    out.push({ date, scoresByBowler: { [name]: games } });
  }
  return out;
}

// ── Merging ─────────────────────────────────────────────────────────────

// Existing nights plus imported ones, keyed by date.
//
// A date already present KEEPS what is already there. The device that
// scored a night is the better source for it — the import is a copy made
// on somebody else's phone, and overwriting would let a stale share
// replace scores that were corrected since.
//
// Which also makes this idempotent: load the same link twice and the
// second one changes nothing.
export function mergeSharedNights(existing, incoming, bowler) {
  const mine = (Array.isArray(existing) ? existing : []).filter(n => n && typeof n === "object");
  const theirs = (Array.isArray(incoming) ? incoming : []).filter(n => n && typeof n === "object");
  const name = typeof bowler === "string" ? bowler.trim() : "";

  const byDate = new Map();
  for (const n of mine) byDate.set(String(n.date), n);

  let added = 0, skipped = 0;
  for (const n of theirs) {
    const key = String(n.date);
    const already = byDate.get(key);
    if (!already) { byDate.set(key, n); added++; continue; }
    // Same date, and this bowler already has scores on it: keep them.
    if (name && Array.isArray((already.scoresByBowler || {})[name])) { skipped++; continue; }
    // Same date, but nothing for this bowler yet -- fold them in.
    byDate.set(key, {
      ...already,
      scoresByBowler: { ...(already.scoresByBowler || {}), ...(n.scoresByBowler || {}) },
    });
    added++;
  }

  const merged = [...byDate.values()].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")));
  return { nights: merged, added, skipped };
}

// What to tell someone after a load. Counts, not a list: "4 nights added"
// is the answer to the only question they have.
export function describeImport(result) {
  // Destructured in the body: `= {}` defaults an OMITTED argument only,
  // and a null threw on the parameter list. Third time this has caught me
  // today, which is why domain/chunkReload.js says the same thing.
  const r = (result && typeof result === "object") ? result : {};
  const added = Number(r.added) || 0;
  const skipped = Number(r.skipped) || 0;
  if (!added && !skipped) return "Nothing in that link.";
  const night = n => `${n} night${n === 1 ? "" : "s"}`;
  if (added && skipped) return `${night(added)} added. ${night(skipped)} you already had.`;
  if (added) return `${night(added)} added.`;
  return `You already had ${skipped === 1 ? "that night" : `all ${skipped} of those nights`}.`;
}
