// Who you're keeping score for.
//
// The old "Who's Bowling" chip row didn't say whose game was being recorded
// -- it read like "who is here tonight", when it actually meant "whose shot
// am I about to log". That mattered because the answer differs by
// environment, and conflating them let someone log a shot against the wrong
// person entirely.
//
// The rules, and why:
//
//   LEAGUE      You often keep the book for the whole team, so teammates
//               and roster placeholders are offered -- but only after you
//               say you're scoring for others. Default is just you.
//
//   TOURNAMENT  Never anyone else. You're bowling your own squad and
//               recording your own results; there is no team book to keep.
//               Offering the option here only creates a way to file your
//               scores under someone else's name by mistake.
//
//   PRACTICE    Whoever showed up, by name, free text. These are practice
//               partners, not roster members -- often not app users at all
//               -- so they exist LOCALLY ONLY and never reach the cloud.
//               Uploading a name someone typed about a third party who
//               never agreed to it isn't ours to do.
//
//   CASUAL      Same as practice, for the same reason.

export const SCOREKEEPING_MODES = ["self", "others"];

// Environments where you can keep score for anyone but yourself.
export function allowsOtherBowlers(environment) {
  return environment !== "tournament";
}

// Where the "others" come from. Roster-backed environments draw on real
// team members; the rest take free text.
export function otherBowlerSource(environment) {
  if (environment === "league") return "roster";
  if (environment === "practice" || environment === "casual") return "freetext";
  return "none";
}

// Practice and casual guests are never uploaded. A name typed about
// someone who isn't a user of this app, and hasn't agreed to anything,
// stays on this device.
export function guestsAreLocalOnly(environment) {
  return otherBowlerSource(environment) === "freetext";
}

// The people you can log for in this environment, always with the owner
// first so the common case is one tap away.
//
// `owner`      the signed-in user's own bowler name
// `teams`      full team list, for roster lookup in league play
// `guests`     locally-held practice partners
// `= {}` only defaults an argument that is UNDEFINED. Passed null, or a
// number, destructuring throws on the parameter list itself -- before
// any guard in the body could run. Taking the argument whole and
// destructuring inside is the only way to cover it.
export function scorekeepingOptions(options) {
  const { environment, owner, league, teams, guests } = (options && typeof options === "object" && !Array.isArray(options)) ? options : {};
  const me = owner || "";
  if (!allowsOtherBowlers(environment)) return me ? [me] : [];

  const source = otherBowlerSource(environment);
  if (source === "roster") {
    // Teammates on the roster for THIS league, plus placeholders (subs and
    // unclaimed invites), which are already part of the team record.
    const mates = (teams || [])
      .filter(t => !league || t.league === league)
      .flatMap(t => t.members || []);
    return [...new Set([me, ...mates].filter(Boolean))];
  }
  if (source === "freetext") {
    return [...new Set([me, ...(guests || [])].filter(Boolean))];
  }
  return me ? [me] : [];
}

// A short line explaining what the picker is for, in this environment's
// terms. Shown under the control rather than left to be inferred.
export function scorekeepingHelp(environment) {
  switch (environment) {
    case "league":
      return "Keeping the book for the team? Add your teammates and log their shots too.";
    case "practice":
      return "Practising with someone? Add them to compare sessions afterwards. Their scores stay on this device.";
    case "casual":
      return "Bowling with others? Add them to keep everyone's score. Their scores stay on this device.";
    default:
      return "";
  }
}

export function normalizeGuests(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw.filter(g => typeof g === "string").map(g => g.trim()).filter(Boolean)
  )];
}

export function addGuest(guests, name) {
  const clean = (name || "").trim();
  if (!clean) return guests || [];
  // Guest lists hold NAMES, and a non-string in there threw on
  // toLowerCase during the duplicate check.
  const existing = (Array.isArray(guests) ? guests : []).filter(g => typeof g === "string");
  // Case-insensitive so "Aaron" and "aaron" don't become two people whose
  // practice results can't be compared.
  if (existing.some(g => g.toLowerCase() === clean.toLowerCase())) return existing;
  return [...existing, clean];
}

export function removeGuest(guests, name) {
  guests = Array.isArray(guests) ? guests : [];
  return (guests || []).filter(g => g !== name);
}
