import { inferLeagueDay } from "./reminders.js";
// Coaching: pairing, tasks, and notes.
//
// PAIRING follows the same shape as friendships (requester/addressee/
// status) because the flow is the same one and inventing a second pattern
// for it would mean two things to reason about. The difference is that a
// coaching link is DIRECTIONAL: one side is the coach and the other is
// the bowler, and that has to be recorded explicitly rather than inferred
// from who asked. Either side can send the request -- a bowler asking a
// coach to take them on, and a coach adding a bowler they already work
// with, are both real -- so "who requested" and "who is the coach" are
// two separate fields.
//
// TASKS are what a coach assigns. The important design decision is that a
// task has three outcomes, not two: done, attempted-but-not-met, and
// still open. A bowler who worked the drill all week and got to 68% on a
// 75% target has NOT failed, and collapsing that into "incomplete" throws
// away the most useful thing the coach could see. So an attempt records
// the number reached alongside the target.
//
// NOTES are two-way. Both sides can write, both sides see everything on
// their shared thread. There is deliberately no private-to-coach note
// here: a note the bowler can't see is a different feature with different
// consent implications, and quietly mixing the two in one table is how
// something private gets shown by accident later.

import { GOAL_TYPES, goalTypeFor, minSampleFor } from "./goals.js";

export const RELATIONSHIP_STATUSES = ["pending", "accepted", "declined"];

// ── Pairing ─────────────────────────────────────────────────────────────

// Sorts raw relationship rows into what this user needs to act on, from
// their own point of view. Mirrors categorizeFriendships in Friends.jsx.
//
// `profilesById` maps the other person's user id to their display name.
export function categorizeCoaching(rows, myUserId, profilesById = {}) {
  const myBowlers = [];   // I coach these people
  const myCoaches = [];   // these people coach me
  const incoming = [];    // waiting on my answer
  const outgoing = [];    // waiting on theirs

  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r) continue;
    const iAmCoach = r.coach_id === myUserId;
    const iAmBowler = r.bowler_id === myUserId;
    if (!iAmCoach && !iAmBowler) continue;

    const otherId = iAmCoach ? r.bowler_id : r.coach_id;
    const entry = {
      relationshipId: r.id,
      userId: otherId,
      displayName: profilesById[otherId] || "Unknown",
      // Their role, not mine -- what the UI wants to label them as.
      theirRole: iAmCoach ? "bowler" : "coach",
      // When the coach next sees this bowler. Distinct from their next
      // league night: a coach doesn't necessarily attend league, and a
      // session is usually on a practice lane on another day.
      nextSession: r.next_session || "",
      nextSessionNote: r.next_session_note || "",
      myRole: iAmCoach ? "coach" : "bowler",
      status: r.status,
    };

    if (r.status === "accepted") {
      (iAmCoach ? myBowlers : myCoaches).push(entry);
    } else if (r.status === "pending") {
      // The person who did NOT request is the one who has to answer.
      (r.requested_by === myUserId ? outgoing : incoming).push(entry);
    }
    // Declined rows are kept in the table (so the same request isn't
    // re-sent blindly) but surfaced nowhere.
  }

  return { myBowlers, myCoaches, incoming, outgoing };
}

export function coachingToRow(rel, myUserId) {
  return {
    coach_id: rel.coachId,
    bowler_id: rel.bowlerId,
    requested_by: rel.requestedBy || myUserId,
    status: RELATIONSHIP_STATUSES.includes(rel.status) ? rel.status : "pending",
  };
}

// ── Tasks ───────────────────────────────────────────────────────────────

export const TASK_STATUSES = ["open", "completed", "attempted"];

// Tasks may optionally hang off a measurable statistic. Reusing the goal
// types means a coach's "get your 10 pin spares to 75%" is measured by
// exactly the same code, and inherits the same sample gating -- a target
// can't be reported as met off a handful of attempts just because a coach
// set it rather than the bowler.
export const TASK_METRIC_IDS = GOAL_TYPES.map(g => g.id);

export function emptyTask(assignedBy = "") {
  return {
    id: "",
    relationshipId: "",
    assignedBy,
    title: "",
    detail: "",
    // Optional measurable target.
    metricId: "",
    target: "",
    dueDate: "",
    status: "open",
    // Filled in when the bowler responds.
    result: "",       // the number they actually reached, if measurable
    bowlerNote: "",
    completedAt: "",
  };
}

function num(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTask(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = (raw.title || "").trim();
  // A task with no title is not a task -- it would render as a blank row
  // the bowler can't act on.
  if (!title) return null;

  const metricId = TASK_METRIC_IDS.includes(raw.metricId) ? raw.metricId : "";
  const target = metricId ? num(raw.target) : null;

  return {
    id: raw.id || "",
    relationshipId: raw.relationshipId || "",
    assignedBy: raw.assignedBy || "",
    title,
    detail: (raw.detail || "").trim(),
    metricId,
    target: target === null ? "" : String(Math.round(target)),
    dueDate: raw.dueDate || "",
    status: TASK_STATUSES.includes(raw.status) ? raw.status : "open",
    result: raw.result === "" || raw.result == null ? "" : String(num(raw.result) ?? ""),
    bowlerNote: (raw.bowlerNote || "").trim(),
    completedAt: raw.completedAt || "",
  };
}

export function normalizeTasks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTask).filter(Boolean);
}

// The bowler marking a task done.
export function completeTask(task, note = "") {
  return {
    ...task,
    status: "completed",
    bowlerNote: (note || "").trim(),
    completedAt: new Date().toISOString(),
  };
}

// The bowler recording an attempt that fell short. Deliberately a
// first-class outcome rather than "not done": the number reached is the
// point, and a coach seeing 68% against a 75% target learns far more than
// from an empty checkbox.
export function recordAttempt(task, reached, note = "") {
  const n = num(reached);
  return {
    ...task,
    status: "attempted",
    result: n === null ? "" : String(n),
    bowlerNote: (note || "").trim(),
    completedAt: new Date().toISOString(),
  };
}

export function reopenTask(task) {
  return { ...task, status: "open", result: "", completedAt: "" };
}

// How an attempt landed against its target. Null when the task has no
// measurable target or no recorded result -- there is nothing to compare.
export function taskProgress(task, leftHanded = false) {
  if (!task?.metricId) return null;
  const type = goalTypeFor(task.metricId, leftHanded);
  if (!type) return null;
  const target = num(task.target);
  const reached = num(task.result);
  if (target === null) return null;

  if (reached === null) {
    return { label: type.label, unit: type.unit, target, reached: null, met: false, shortBy: null };
  }
  return {
    label: type.label,
    unit: type.unit,
    target,
    reached,
    met: reached >= target,
    shortBy: reached >= target ? null : Math.round((target - reached) * 10) / 10,
    // Carried through so a coach can see what sample the number rests on,
    // for the same reason goals gate: a 100% off four attempts is not a
    // result to change someone's game over.
    minSample: minSampleFor(type),
  };
}

// Split for the two views: a bowler wants what's still on them; a coach
// wants what has come back.
export function partitionTasks(tasks) {
  const list = normalizeTasks(tasks);
  return {
    open: list.filter(t => t.status === "open"),
    completed: list.filter(t => t.status === "completed"),
    attempted: list.filter(t => t.status === "attempted"),
  };
}

export function taskToRow(task, relationshipId, userId) {
  return {
    id: task.id || undefined,
    relationship_id: relationshipId,
    assigned_by: userId,
    title: task.title,
    detail: task.detail || null,
    metric_id: task.metricId || null,
    target: num(task.target),
    due_date: task.dueDate || null,
    status: task.status,
    result: num(task.result),
    bowler_note: task.bowlerNote || null,
    completed_at: task.completedAt || null,
  };
}

export function taskFromRow(row) {
  if (!row) return null;
  return normalizeTask({
    id: row.id,
    relationshipId: row.relationship_id,
    assignedBy: row.assigned_by,
    title: row.title,
    detail: row.detail,
    metricId: row.metric_id,
    target: row.target,
    dueDate: row.due_date,
    status: row.status,
    result: row.result,
    bowlerNote: row.bowler_note,
    completedAt: row.completed_at,
  });
}

// ── Notes ───────────────────────────────────────────────────────────────

export function normalizeNote(raw) {
  if (!raw || typeof raw !== "object") return null;
  const body = (raw.body || "").trim();
  if (!body) return null;
  return {
    id: raw.id || "",
    relationshipId: raw.relationshipId || "",
    authorId: raw.authorId || "",
    body,
    createdAt: raw.createdAt || "",
  };
}

// Oldest first, so a thread reads top to bottom like a conversation.
export function sortNotes(notes) {
  return (Array.isArray(notes) ? notes : [])
    .map(normalizeNote)
    .filter(Boolean)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export function noteToRow(note, relationshipId, userId) {
  return {
    relationship_id: relationshipId,
    author_id: userId,
    body: note.body,
  };
}

export function noteFromRow(row) {
  if (!row) return null;
  return normalizeNote({
    id: row.id,
    relationshipId: row.relationship_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  });
}

// ── Bowler snapshot, for the coach ──────────────────────────────────────
//
// A coach's whole reason for being on this screen is "how is my bowler
// actually doing," and tasks/notes never answer that. This reads the same
// sessions a bowler sees on their own Stats tab and reduces it to what a
// coach glances at first: average, best, most recent scores, and whether
// the trend across their last several nights is real or just noise.
//
// Sample-gated the same way the rest of this app is: a "trend" off two
// nights is not a trend, so trendDirection from domain/trends.js still
// applies its own threshold here rather than this module inventing a
// looser one for the coach's benefit.

import { scoreSeries as trendScoreSeries, trendDirection, describeTrend } from "./trends.js";

// `sessions` is expected to already be scoped to one bowler -- by
// user_id, at the query level -- not filtered here by name. A session's
// bowler_name is a free-typed label the bowler chose for themselves and
// isn't guaranteed to match their account's display name (the same gap
// Friends.jsx already warns about for its own leaderboard). Matching on
// it a second time here would silently return nothing for a coach's
// bowler whenever those two names differ, which defeats the entire
// point of this function.
export function bowlerSnapshot(sessions) {
  const mine = (Array.isArray(sessions) ? sessions : []).filter(Boolean);
  if (!mine.length) return null;

  const allScores = mine.flatMap(s => Array.isArray(s.scores) ? s.scores : []).filter(v => Number.isFinite(v));
  if (!allScores.length) return null;

  const sorted = [...mine].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const recent = sorted.slice(0, 5).map(s => ({
    date: s.date || "",
    league: s.league || "",
    scores: Array.isArray(s.scores) ? s.scores : [],
    total: s.total ?? null,
  }));

  // "" as the bowler filter inside scoreSeries: it usually filters by
  // name, but mine is already scoped to one person, so passing "" (its
  // documented \"everyone\" value) avoids the same name-matching trap here.
  const series = trendScoreSeries(mine, "", "", "average");
  const direction = trendDirection(series);

  return {
    average: Math.floor(allScores.reduce((a, b) => a + b, 0) / allScores.length),
    high: Math.max(...allScores),
    nights: mine.length,
    recent,
    trendSummary: describeTrend("average", series),
    trendDirection: direction.direction,
  };
}

// ── Shot-level breakdown, for the coach ─────────────────────────────────
//
// The snapshot above answers "how is my bowler scoring". This answers
// "why" -- the thing 11 of 14 coaches asked for. Scores tell a coach the
// result; carry, spare conversion, and where the misses go tell them what
// to work on.
//
// Takes the handedness predicate rather than a flag, for the same reason
// the drill comparison does: the coach and the bowler are different
// people and can throw with different hands. Passing the coach's own hand
// here would mislabel every corner-pin number.
export function shotBreakdown(shots, { isSplit, isSinglePinLeave, isCornerPinLeave, leftHanded = false } = {}) {
  const list = (Array.isArray(shots) ? shots : []).filter(Boolean);
  if (!list.length) return null;

  // First balls only -- a strike rate that counted spare attempts as
  // misses would understate every bowler.
  const frames = list.filter(s => !s.ballNum || s.ballNum === 1);
  const strikes = frames.filter(s => s.result === "Strike").length;

  const spareAttempts = isSplit
    ? list.filter(s => s.result !== "Strike" && s.spareMade !== "" && !isSplit(s))
    : [];
  const sparesMade = spareAttempts.filter(s => s.spareMade === "Yes").length;

  const singlePin = isSinglePinLeave
    ? list.filter(s => isSinglePinLeave(s) && s.spareMade !== "")
    : [];
  const singlePinMade = singlePin.filter(s => s.spareMade === "Yes").length;

  const cornerPin = isCornerPinLeave
    ? list.filter(s => isCornerPinLeave(s, leftHanded) && s.spareMade !== "")
    : [];
  const cornerPinMade = cornerPin.filter(s => s.spareMade === "Yes").length;

  const splits = isSplit ? list.filter(s => isSplit(s)) : [];

  // Miss tendencies -- the most directly coachable thing in here.
  const missCounts = {};
  for (const s of list) {
    const misses = Array.isArray(s.miss) ? s.miss : s.miss ? [s.miss] : [];
    for (const m of misses) missCounts[m] = (missCounts[m] || 0) + 1;
  }
  const misses = Object.entries(missCounts)
    .map(([miss, count]) => ({ miss, count }))
    .sort((a, b) => b.count - a.count);

  const pct = (made, total) => (total ? Math.round((made / total) * 100) : null);

  return {
    shots: list.length,
    frames: frames.length,
    strikeRate: pct(strikes, frames.length),
    strikeSample: frames.length,
    spareRate: pct(sparesMade, spareAttempts.length),
    spareSample: spareAttempts.length,
    singlePinRate: pct(singlePinMade, singlePin.length),
    singlePinSample: singlePin.length,
    cornerPinRate: pct(cornerPinMade, cornerPin.length),
    cornerPinSample: cornerPin.length,
    // Labelled for the BOWLER's hand, not the coach's.
    cornerPinLabel: leftHanded ? "7 Pin" : "10 Pin",
    splitRate: pct(splits.length, frames.length),
    splitCount: splits.length,
    misses,
  };
}

// Tasks the bowler has responded to since the coach last looked.
//
// Push notification is blocked on app-store packaging, but the useful
// part isn't the push -- it's that a coach opening the app can see at a
// glance which bowlers need attention, instead of tapping through every
// one to find out. This is that, and it works today.
//
// Keyed on completedAt so it survives a reload and doesn't re-announce.
// A task the bowler reopened deliberately drops out: it's back to being
// open work, not a result waiting to be read.
export function respondedSince(tasksByRelationship, lastSeenIso) {
  const since = lastSeenIso ? String(lastSeenIso) : "";
  const out = {};
  for (const [relationshipId, tasks] of Object.entries(tasksByRelationship || {})) {
    const fresh = normalizeTasks(tasks).filter(t =>
      (t.status === "completed" || t.status === "attempted") &&
      t.completedAt &&
      String(t.completedAt) > since);
    if (fresh.length) out[relationshipId] = fresh;
  }
  return out;
}

// Most recent response across everything, for advancing the marker once
// the coach has actually looked.
export function latestResponseAt(tasksByRelationship) {
  let latest = "";
  for (const tasks of Object.values(tasksByRelationship || {})) {
    for (const t of normalizeTasks(tasks)) {
      if (t.completedAt && String(t.completedAt) > latest) latest = String(t.completedAt);
    }
  }
  return latest || null;
}

// ── Coach roster summary ────────────────────────────────────────────────
//
// A coach with six bowlers had to tap into each one in turn to see what
// they were working on. This is the one-screen answer: every bowler, what
// they're on, how far along, and when they next bowl.
//
// Composed from data the app already has -- open tasks, their progress,
// and the league night inferred from actual session history -- so it adds
// no new tracking burden and can't drift from the underlying records.

// The next occurrence of a weekday, from today. Returns null when the
// bowler has no established night rather than guessing one.
export function nextDateForWeekday(weekday, today = new Date()) {
  if (weekday === null || weekday === undefined) return null;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const delta = (weekday - d.getDay() + 7) % 7;
  // A session TODAY still counts as today's night, not next week's.
  d.setDate(d.getDate() + delta);
  return d;
}

// One row per coached bowler.
//
// `tasks` is every task across all relationships; each row picks that
// bowler's most urgent open one -- soonest due date first, then oldest --
// because a coach looking at a roster wants the thing that needs
// attention, not an arbitrary pick.
// `= {}` only defaults an argument that is UNDEFINED. Passed null, or a
// number, destructuring throws on the parameter list itself -- before
// any guard in the body could run. Taking the argument whole and
// destructuring inside is the only way to cover it.
export function coachRoster(options) {
  const {
  bowlers = [], tasks = [], sessions = [], leagues = [],
  handednessByBowler = {}, today = new Date(),
} = (options && typeof options === "object" && !Array.isArray(options)) ? options : {};
  return bowlers.map(b => {
    const name = typeof b === "string" ? b : b?.name;
    const relationshipId = typeof b === "string" ? "" : b?.relationshipId || "";

    const mine = (tasks || []).filter(t =>
      t && t.status === "open" &&
      (relationshipId ? t.relationshipId === relationshipId : true) &&
      (t.bowlerName ? t.bowlerName === name : true));

    // Soonest due first; undated tasks sort last rather than first, since
    // a task with a deadline is the one that needs attention.
    const sorted = [...mine].sort((a, c) => {
      const ad = a.dueDate || "9999-99-99", cd = c.dueDate || "9999-99-99";
      return ad === cd ? 0 : (ad < cd ? -1 : 1);
    });
    const current = sorted[0] || null;

    const progress = current
      ? taskProgress(current, !!handednessByBowler[name])
      : null;

    // The SCHEDULED coaching session -- set by the coach, not inferred.
    // Their next league night is shown separately because it's useful
    // context ("they bowl Tuesday, I see them Thursday"), but it is not
    // the same thing and must never stand in for it.
    const scheduled = typeof b === "string" ? "" : (b?.nextSession || "");

    let nextLeagueNight = null, nextLeague = "";
    for (const league of leagues) {
      const day = inferLeagueDay(sessions.filter(s => s.bowler === name), league);
      if (day === null) continue;
      const d = nextDateForWeekday(day, today);
      if (d && (!nextLeagueNight || d < nextLeagueNight)) { nextLeagueNight = d; nextLeague = league; }
    }

    return {
      bowler: name,
      relationshipId,
      currentTask: current,
      progress,
      openTaskCount: mine.length,
      // The scheduled session, as a plain date string, or "" when the
      // coach hasn't set one. Deliberately NOT defaulted to the league
      // night -- an invented date is worse than a blank.
      nextSession: scheduled,
      nextSessionNote: typeof b === "string" ? "" : (b?.nextSessionNote || ""),
      nextLeagueNight,
      nextLeague,
    };
  });
}
