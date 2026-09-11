// League-night reminders.
//
// The reminder itself is simple; the delivery is the constraint. Real push
// notifications need a native wrapper (Capacitor) and platform permissions
// -- that's part of app store packaging, which is deferred. Until then,
// this offers what a web app CAN do: a calendar event the bowler adds once
// and which recurs on its own, and an in-app banner on league day.
//
// When packaging happens, `reminderSpec` is what gets handed to the push
// scheduler unchanged -- the intent is captured now, the delivery upgrades
// later without asking the bowler to set it up twice.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Infers which weekday a league bowls on from its logged sessions -- the
// most common day. Returns null with too little data to be confident, so
// the app never nags on a guessed day.
export function inferLeagueDay(sessions, league, minSessions = 3) {
  sessions = Array.isArray(sessions) ? sessions : [];
  const days = (sessions || [])
    .filter(s => s.league === league && s.date)
    .map(s => new Date(s.date + "T12:00:00").getDay())
    .filter(d => !Number.isNaN(d));
  if (days.length < minSessions) return null;
  const counts = {};
  days.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  // Needs a clear majority, not just a plurality -- a league that's split
  // across two nights shouldn't get a reminder for the wrong one.
  return n / days.length >= 0.6 ? Number(best) : null;
}

export function dayName(day) {
  return DAY_NAMES[day] ?? "";
}

// A reminder as intent: which league, which day, how long before. This is
// the object a push scheduler would consume once one exists.
export function reminderSpec(league, day, minutesBefore = 60, time = "19:00") {
  return { league, day, minutesBefore, time, enabled: true };
}

export function normalizeReminder(raw) {
  if (!raw || typeof raw !== "object") return null;
  const day = Number(raw.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  const mins = Number(raw.minutesBefore);
  return {
    league: raw.league || "",
    day,
    minutesBefore: Number.isFinite(mins) && mins >= 0 ? Math.round(mins) : 60,
    time: typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : "19:00",
    enabled: raw.enabled !== false,
  };
}

// Is today the league's day? Drives an in-app banner, which is the one
// delivery channel a web app has without permissions.
export function isLeagueDay(reminder, today = new Date()) {
  if (!reminder?.enabled) return false;
  return today.getDay() === reminder.day;
}

// Builds an .ics file the bowler adds to their phone calendar once. It
// recurs weekly on its own, with an alarm -- the closest a web app gets to
// a push notification, and arguably better: it survives the app being
// closed, uninstalled, or forgotten.
export function reminderToIcs(reminder, centerName) {
  if (!reminder || typeof reminder !== "object" || Array.isArray(reminder)) return "";
  const [hh, mm] = (reminder.time || "19:00").split(":").map(Number);
  const dayCode = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][reminder.day];

  // Next occurrence of that weekday, as the DTSTART anchor.
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() + ((reminder.day - now.getDay() + 7) % 7));
  start.setHours(hh, mm, 0, 0);
  const pad = n => String(n).padStart(2, "0");
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  const title = `${reminder.league.replace(" House Shot", "")} bowling`;
  const location = centerName ? `\nLOCATION:${centerName.replace(/[,;]/g, "\\$&")}` : "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bowling Tracker//EN",
    "BEGIN:VEVENT",
    `UID:bowling-${reminder.league.replace(/\W+/g, "-").toLowerCase()}-${reminder.day}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`,
    `SUMMARY:${title}`,
    location,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-PT${reminder.minutesBefore}M`,
    `DESCRIPTION:${title} in ${reminder.minutesBefore} minutes`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
