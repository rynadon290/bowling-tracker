// One inbox, for everything that needs the bowler to do something.
//
// These requests were scattered: a coaching invitation only visible on
// the Coach tab, a friend request only on Social, a book-average prompt
// only on Profile, imported scores only in their own screen. Each was
// findable if you happened to open the right tab, which meant the answer
// to "is there anything waiting for me" was "go and check five places".
//
// This assembles them into one list. It does NOT own any of them -- each
// item points back at the screen that already handles it. The inbox is a
// notification surface, not a second implementation of every workflow,
// because two places that can accept a coaching invitation is two places
// that can disagree about whether it was accepted.

import { pendingFor, needingReentry, canCorrect } from "./importVerification.js";
import { categorizeCoaching, partitionTasks } from "./coaching.js";

// Ordered by how much the bowler is blocked by it. Requests from other
// people come first: somebody is waiting on an answer. Housekeeping the
// app noticed by itself comes last.
export const INBOX_PRIORITY = [
  "coachingRequest",
  "friendRequest",
  "teamInvite",
  "importedScores",
  "coachTask",
  "teammateResponse",
  "importReentry",
  "staleTeammateScores",
  "bookAverage",
  "catalogRejection",
];

function sortItems(items) {
  return items.sort((a, b) =>
    INBOX_PRIORITY.indexOf(a.type) - INBOX_PRIORITY.indexOf(b.type));
}

// Builds the whole list. Every source is optional -- a bowler with no
// team, no coach and no friends should get an empty array rather than a
// pile of guards at every call site.
export function buildInbox({
  bowler,
  userId,
  importedScores = [],
  sessions = [],
  coachingRelationships = [],
  coachingProfilesById = {},
  tasksByRelationship = {},
  unreadResponses = {},
  friendRequests = [],
  teamInvites = [],
  bookAverageDue = null,
  catalogRejections = [],
  coachViewOn = false,
} = {}) {
  const items = [];

  // ── Scores imported from a teammate's photo ──
  const pendingScores = pendingFor(importedScores, bowler);
  if (pendingScores.length) {
    items.push({
      id: "imported-scores",
      type: "importedScores",
      title: pendingScores.length === 1 ? "Scores to check" : `${pendingScores.length} nights of scores to check`,
      detail: "A teammate imported these from a scorecard photo. They already count — confirming marks them checked.",
      count: pendingScores.length,
      view: "inbox",
    });
  }

  const reentry = needingReentry(importedScores).filter(r => r.bowler === bowler);
  if (reentry.length) {
    items.push({
      id: "import-reentry",
      type: "importReentry",
      title: reentry.length === 1 ? "A night needs re-entering" : `${reentry.length} nights need re-entering`,
      detail: "You said these weren't yours, so they've stopped counting.",
      count: reentry.length,
      view: "inbox",
    });
  }

  // A teammate's unconfirmed night this bowler is now allowed to fix.
  const stale = importedScores.filter(r =>
    r && r.bowler !== bowler && r.status === "pending" &&
    canCorrect(r, bowler, { sessions, verifiedTeammates: importedScores
      .filter(x => x.league === r.league && x.date === r.date &&
        (x.status === "verified" || x.status === "corrected"))
      .map(x => x.bowler) }).allowed);
  if (stale.length) {
    items.push({
      id: "stale-teammate-scores",
      type: "staleTeammateScores",
      title: `${stale.length} teammate score${stale.length === 1 ? "" : "s"} unconfirmed`,
      detail: "Nobody confirmed these and a session has since finished. You can correct them.",
      count: stale.length,
      view: "inbox",
    });
  }

  // ── Coaching ──
  const coaching = categorizeCoaching(coachingRelationships, userId, coachingProfilesById);
  for (const req of coaching.incoming) {
    items.push({
      id: `coaching-${req.relationshipId}`,
      type: "coachingRequest",
      title: `${req.displayName} wants to be your ${req.theirRole}`,
      detail: "Accept or decline on the Coach tab.",
      count: 1,
      view: "coaching",
    });
  }

  // Open tasks a coach has set. Only for the bowler side -- a coach
  // looking at their own screen isn't being asked to do these.
  if (!coachViewOn) {
    const openTasks = coaching.myCoaches.flatMap(c => {
      const tasks = partitionTasks(tasksByRelationship[c.relationshipId] || []).open;
      return tasks.map(t => ({ coach: c.displayName, task: t }));
    });
    if (openTasks.length) {
      items.push({
        id: "coach-tasks",
        type: "coachTask",
        title: `${openTasks.length} task${openTasks.length === 1 ? "" : "s"} from your coach`,
        detail: openTasks.length === 1 ? openTasks[0].task.title : "Work your coach has set for you.",
        count: openTasks.length,
        view: "coaching",
      });
    }
  }

  // Responses a coach hasn't read. Only meaningful in coach view -- it's
  // their bowlers reporting back.
  if (coachViewOn) {
    const responded = Object.values(unreadResponses || {}).reduce((n, list) => n + (list?.length || 0), 0);
    if (responded) {
      items.push({
        id: "coach-responses",
        type: "teammateResponse",
        title: `${responded} task update${responded === 1 ? "" : "s"} from your bowlers`,
        detail: "They've marked work done or reported how far they got.",
        count: responded,
        view: "coaching",
      });
    }
  }

  // ── Social ──
  for (const req of friendRequests) {
    items.push({
      id: `friend-${req.friendshipId || req.userId}`,
      type: "friendRequest",
      title: `${req.displayName || "Someone"} sent a friend request`,
      detail: "Accept or decline on the Social tab.",
      count: 1,
      view: "social",
    });
  }
  for (const invite of teamInvites) {
    items.push({
      id: `team-${invite.id || invite.teamId}`,
      type: "teamInvite",
      title: `Invitation to join ${invite.teamName || "a team"}`,
      detail: "Accept or decline on the Social tab.",
      count: 1,
      view: "social",
    });
  }

  // ── Housekeeping the app noticed ──
  if (bookAverageDue?.needed) {
    items.push({
      id: "book-average",
      type: "bookAverage",
      title: "Book average needs updating",
      detail: bookAverageDue.league
        ? `${bookAverageDue.league} has finished its season.`
        : "A league season has finished.",
      count: 1,
      view: "profile",
    });
  }

  for (const ball of catalogRejections) {
    items.push({
      id: `catalog-${ball}`,
      type: "catalogRejection",
      title: `Your specs for ${ball} were rejected`,
      detail: "Other bowlers voted them down. Check and resubmit if you think they were right.",
      count: 1,
      view: "profile",
    });
  }

  return sortItems(items);
}

// What the icon badge shows. Counts ITEMS, not underlying records: three
// tasks from one coach is one thing to go and deal with, and a badge
// reading 14 makes an app feel like a chore rather than a tool.
export function inboxCount(items) {
  return (Array.isArray(items) ? items : []).length;
}
