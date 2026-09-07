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

  for (const r of rows || []) {
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
  return (notes || [])
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
