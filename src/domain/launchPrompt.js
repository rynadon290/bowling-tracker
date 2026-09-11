// When to show the "Bowling today?" prompt.
//
// The old rule was "once per day, every day," which meant a bowler with a
// standing Tuesday league got asked what they were doing every single
// Tuesday, forever, when the answer had been the same for months. That's
// the kind of prompt people learn to dismiss without reading, which makes
// it useless on the day it actually matters.
//
// The rule now: show it once so a new bowler discovers the setting exists,
// then afterwards only on a day that ISN'T one of their usual nights. On a
// regular league night the app already has the right setup, so it says
// nothing. On a random Saturday -- the day they might be at a tournament
// or just out with the kids -- it asks.
//
// "Usual night" is derived from what they've actually bowled, not from a
// setting they have to maintain. Nothing to configure, and it follows them
// if their league night changes.

import { localDateString } from "../constants.js";

// A weekday only counts as "usual" once it's been bowled this many times.
// Two sessions on the same weekday could easily be coincidence; three is a
// pattern worth trusting enough to stay quiet about.
export const USUAL_NIGHT_MIN_SESSIONS = 3;

// Only look at recent history. A league night from two years ago shouldn't
// keep the prompt suppressed on a weekday the bowler no longer plays.
export const USUAL_NIGHT_LOOKBACK_DAYS = 120;

// Parses a "YYYY-MM-DD" date string as a LOCAL date.
//
// new Date("2026-03-01") parses as UTC midnight, which in any negative
// UTC-offset timezone is the previous day locally -- that would shift a
// Sunday session onto Saturday and quietly corrupt the whole weekday
// count. Same class of bug localDateString() in constants.js exists to
// avoid, so it gets the same treatment here.
export function parseLocalDate(dateStr) {
  if (typeof dateStr !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Rejects things like 2026-02-31 that roll over into the next month.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return date;
}

// Day of week, 0 = Sunday, or null if the date is unusable.
export function weekdayOf(dateStr) {
  const d = parseLocalDate(dateStr);
  return d ? d.getDay() : null;
}

// Which weekdays this bowler usually bowls, as a Set of 0-6.
//
// Counts distinct DATES, not sessions: two league sessions logged on the
// same Tuesday is one Tuesday of evidence, not two. Without this a single
// heavily-logged night could masquerade as a pattern.
export function usualNights(sessions, bowler, today = new Date()) {
  // `today` defaults only when OMITTED. Passed a string or a null it
  // threw on getFullYear -- and these run on every app open.
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cutoff.setDate(cutoff.getDate() - USUAL_NIGHT_LOOKBACK_DAYS);

  const datesByWeekday = new Map();
  for (const s of (Array.isArray(sessions) ? sessions : [])) {
    if (!s) continue;
    // When a bowler is named, only their own sessions count -- a shared
    // device shouldn't blend two people's schedules together.
    if (bowler && s.bowler && s.bowler !== bowler) continue;
    const d = parseLocalDate(s.date);
    if (!d || d < cutoff || d > today) continue;
    const wd = d.getDay();
    if (!datesByWeekday.has(wd)) datesByWeekday.set(wd, new Set());
    datesByWeekday.get(wd).add(s.date);
  }

  const out = new Set();
  for (const [wd, dates] of datesByWeekday) {
    if (dates.size >= USUAL_NIGHT_MIN_SESSIONS) out.add(wd);
  }
  return out;
}

// The decision itself.
//
//   seenOnce      - has the prompt ever been shown and acknowledged?
//   dismissedDate - "YYYY-MM-DD" it was last dismissed, or "".
//
// Returns true only when the prompt should render right now.
export function shouldShowLaunchPrompt(options) {
  // Destructuring a null argument throws, and a default only covers
  // undefined -- so an explicit null (easy to pass from optional state)
  // would white-screen the Log tab.
  const {
    sessions,
    bowler,
    seenOnce,
    dismissedDate,
    today = new Date(),
  } = options && typeof options === "object" ? options : {};
  const todayStr = localDateString(today);

  // Dismissing always holds for the rest of that day, whatever the reason
  // it appeared. Nothing below can override this.
  if (dismissedDate === todayStr) return false;

  // First ever launch: show it, so the setting is discoverable at all.
  if (!seenOnce) return true;

  const usual = usualNights(sessions, bowler, today);

  // No established pattern yet (new bowler, or someone who bowls
  // irregularly) -- fall back to the old once-a-day behaviour rather than
  // going silent on someone we know nothing about. Silence here would be
  // worse: they'd never see the prompt again after day one.
  if (usual.size === 0) return true;

  // The actual quiet rule: say nothing on an established night.
  return !usual.has(today.getDay());
}

// Plain-language explanation of the current state, for Settings. Being
// able to see why the prompt is or isn't appearing beats it seeming
// arbitrary.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MODE_NAMES = { league: "league", practice: "practice", tournament: "a tournament", casual: "just for fun" };

export function describeUsualNights(sessions, bowler, today = new Date(), tournaments = []) {
  // `today` defaults only when OMITTED. Passed a string or a null it
  // threw on getFullYear -- and these run on every app open.
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) today = new Date();
  const usual = [...usualNights(sessions, bowler, today)].sort((a, b) => a - b);
  if (!usual.length) {
    return "Not enough history yet — you'll be asked once a day until a pattern shows up.";
  }
  // Naming the MODE, not just the day, so the bowler can see what the app
  // will set for them and correct it if the guess is wrong. "You won't be
  // asked on Tuesdays" is unnerving without saying what happens instead.
  const parts = usual.map(d => {
    const mode = usualModeFor(sessions, tournaments, bowler, d, today);
    return mode ? `${DAY_NAMES[d]}s (${MODE_NAMES[mode] || mode})` : `${DAY_NAMES[d]}s`;
  });
  const list = parts.length === 1
    ? parts[0]
    : parts.length === 2
      ? `${parts[0]} and ${parts[1]}`
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `You usually bowl ${list}. The app sets itself up for you on those days instead of asking.`;
}

// ── Which MODE, not just which night ────────────────────────────────────
//
// usualNights answers "does this bowler bowl on Tuesdays". It does not
// answer "does Tuesday mean league", and that gap had a real cost: the
// prompt goes quiet on an established night, so a bowler who set
// Tournament on Saturday arrived at Tuesday league night still in
// tournament mode, with nothing asking and -- since the mode moved out of
// Settings onto the prompt -- nowhere obvious to fix it.
//
// So: learn the mode per weekday too, and pre-set it.
//
// Environment is derived from the session's league rather than stored on
// it. Practice and casual have container leagues with known names;
// anything else is a real league. Tournaments live in their own table, so
// they're passed in separately rather than inferred.
export function environmentOfSession(s) {
  const name = String(s?.league || "");
  if (name === "Casual") return "casual";
  if (name === "Practice" || name.startsWith("Practice\u00b7")) return "practice";
  return "league";
}

// The mode this bowler usually bowls on a given weekday, or null when
// there's no clear pattern.
//
// Requires the same evidence bar as usualNights (3 distinct dates) AND a
// clear majority -- if someone's Saturdays are half practice and half
// tournament, guessing wrong is worse than asking. Counts distinct dates,
// not sessions, for the same reason usualNights does.
export function usualModeFor(sessions, tournaments, bowler, weekday, today = new Date()) {
  // `today` defaults only when OMITTED. Passed a string or a null it
  // threw on getFullYear -- and these run on every app open.
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cutoff.setDate(cutoff.getDate() - USUAL_NIGHT_LOOKBACK_DAYS);

  const datesByMode = new Map();
  const note = (mode, dateStr) => {
    if (!datesByMode.has(mode)) datesByMode.set(mode, new Set());
    datesByMode.get(mode).add(dateStr);
  };

  for (const s of (Array.isArray(sessions) ? sessions : [])) {
    if (!s) continue;
    if (bowler && s.bowler && s.bowler !== bowler) continue;
    const d = parseLocalDate(s.date);
    if (!d || d < cutoff || d > today || d.getDay() !== weekday) continue;
    note(environmentOfSession(s), s.date);
  }
  for (const t of (Array.isArray(tournaments) ? tournaments : [])) {
    if (!t) continue;
    if (bowler && t.bowler && t.bowler !== bowler) continue;
    // A tournament's days are its own list of dates.
    for (const day of (Array.isArray(t.days) ? t.days : [])) {
      const dateStr = day?.date || day;
      const d = parseLocalDate(dateStr);
      if (!d || d < cutoff || d > today || d.getDay() !== weekday) continue;
      note("tournament", dateStr);
    }
  }

  let best = null, bestCount = 0, total = 0;
  for (const [mode, dates] of datesByMode) {
    total += dates.size;
    if (dates.size > bestCount) { best = mode; bestCount = dates.size; }
  }

  if (bestCount < USUAL_NIGHT_MIN_SESSIONS) return null;
  // Clear majority, not just a plurality: a 3-2 split is a coin flip.
  if (bestCount / total < 0.6) return null;
  return best;
}

// Everything the Bowl tab needs on open: is there a routine for today,
// and if so what is it.
export function todaysRoutine(sessions, tournaments, bowler, today = new Date()) {
  // `today` defaults only when OMITTED. Passed a string or a null it
  // threw on getFullYear -- and these run on every app open.
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) today = new Date();
  const weekday = today.getDay();
  const mode = usualModeFor(sessions, tournaments, bowler, weekday, today);
  return { weekday, mode, isUsual: usualNights(sessions, bowler, today).has(weekday) };
}
