import { useState, useEffect } from "react";
import { C, S, Chip } from "./ui.jsx";
import { formatDate } from "./constants.js";
import {
  categorizeCoaching, coachRoster, partitionTasks, taskProgress, sortNotes,
  emptyTask, TASK_METRIC_IDS,
} from "./domain/coaching.js";
import { GOAL_TYPES, goalTypeFor } from "./domain/goals.js";

function Section({ title, children, subtitle }) {
  return (
    <div style={S.card}>
      <div style={S.label}>{title}</div>
      {subtitle && <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

// One task, from whichever side is looking at it.
function TaskRow({ task, isCoach, leftHanded, onComplete, onAttempt, onReopen, onRemove }) {
  const [attempting, setAttempting] = useState(false);
  const [reached, setReached] = useState("");
  const [note, setNote] = useState("");
  const progress = taskProgress(task, leftHanded);

  const statusColor = task.status === "completed" ? C.strike
    : task.status === "attempted" ? C.spare
    : C.textMuted;

  return (
    <div style={{ padding: "10px", marginBottom: "8px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: C.text, minWidth: 0 }}>{task.title}</div>
        <div style={{ fontSize: "10px", color: statusColor, textTransform: "uppercase", flexShrink: 0 }}>
          {task.status === "attempted" ? "attempted" : task.status}
        </div>
      </div>

      {task.detail && <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px" }}>{task.detail}</div>}

      {progress && (
        <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>
          Target: {progress.target}{progress.unit === "percent" ? "%" : ""} {progress.label}
          {progress.reached != null && (
            <>
              {" · "}
              <span style={{ color: progress.met ? C.strike : C.spare, fontWeight: 600 }}>
                reached {progress.reached}{progress.unit === "percent" ? "%" : ""}
              </span>
              {/* Short by, not "failed" -- the gap is the useful number. */}
              {!progress.met && <> ({progress.shortBy} short)</>}
            </>
          )}
        </div>
      )}

      {task.dueDate && (
        <div style={{ fontSize: "10px", color: C.textMuted, marginTop: "4px" }}>Due {task.dueDate}</div>
      )}

      {task.bowlerNote && (
        <div style={{ fontSize: "11px", color: C.text, marginTop: "6px", fontStyle: "italic" }}>
          “{task.bowlerNote}”
        </div>
      )}

      {/* The bowler's actions. Two outcomes, both first-class -- an
          "attempted" button beside "done" is the whole point: a week of
          work that fell short is not the same as ignoring the task. */}
      {!isCoach && task.status === "open" && !attempting && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
          <button style={{ ...S.btn(), flex: 1, padding: "6px", fontSize: "12px" }} onClick={() => onComplete(task)}>
            Done
          </button>
          <button style={{ ...S.btn(), flex: 1, padding: "6px", fontSize: "12px" }} onClick={() => setAttempting(true)}>
            Worked on it
          </button>
        </div>
      )}

      {!isCoach && attempting && (
        <div style={{ marginTop: "8px" }}>
          {task.metricId && (
            <input style={{ ...S.input, fontSize: "12px", marginBottom: "6px" }} type="number" inputMode="numeric"
              placeholder="What did you get to?"
              value={reached} onChange={e => setReached(e.target.value)} />
          )}
          <input style={{ ...S.input, fontSize: "12px", marginBottom: "6px" }}
            placeholder="Anything to tell your coach?"
            value={note} onChange={e => setNote(e.target.value)} />
          <div style={{ display: "flex", gap: "6px" }}>
            <button style={{ ...S.btn("primary"), flex: 1, padding: "6px", fontSize: "12px" }}
              onClick={() => { onAttempt(task, reached, note); setAttempting(false); setReached(""); setNote(""); }}>
              Save
            </button>
            <button style={{ ...S.btn(), flex: 1, padding: "6px", fontSize: "12px" }}
              onClick={() => setAttempting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isCoach && task.status !== "open" && (
        <button style={{ background: "none", border: "none", padding: 0, marginTop: "6px", fontSize: "11px", color: C.textMuted, cursor: "pointer", textDecoration: "underline" }}
          onClick={() => onReopen(task)}>
          Reopen
        </button>
      )}

      {isCoach && onRemove && (
        <button style={{ background: "none", border: "none", padding: 0, marginTop: "6px", fontSize: "11px", color: C.textMuted, cursor: "pointer", textDecoration: "underline" }}
          onClick={() => onRemove(task)}>
          Remove
        </button>
      )}
    </div>
  );
}

function NewTask({ leftHanded, onAdd, onCancel }) {
  const [draft, setDraft] = useState(emptyTask());
  const [error, setError] = useState("");

  function save() {
    if (!draft.title.trim()) { setError("Give the task a title."); return; }
    onAdd(draft);
    setDraft(emptyTask());
    setError("");
  }

  return (
    <div style={{ padding: "10px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.border}`, marginBottom: "8px" }}>
      <input style={{ ...S.input, fontSize: "13px", marginBottom: "6px" }}
        placeholder="What should they work on?"
        value={draft.title} onChange={e => { setDraft({ ...draft, title: e.target.value }); setError(""); }} />
      <textarea style={{ ...S.input, fontSize: "12px", minHeight: "48px", resize: "vertical", marginBottom: "6px" }}
        placeholder="Detail (optional)"
        value={draft.detail} onChange={e => setDraft({ ...draft, detail: e.target.value })} />

      <div style={{ ...S.label, marginBottom: "4px" }}>Measurable target (optional)</div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
        <select style={{ ...S.sel, flex: 2, fontSize: "12px" }}
          value={draft.metricId} onChange={e => setDraft({ ...draft, metricId: e.target.value })}>
          <option value="">No target</option>
          {TASK_METRIC_IDS.map(id => (
            <option key={id} value={id}>{goalTypeFor(id, leftHanded).label}</option>
          ))}
        </select>
        <input style={{ ...S.input, flex: 1, fontSize: "12px" }} type="number" inputMode="numeric" placeholder="Target"
          disabled={!draft.metricId}
          value={draft.target} onChange={e => setDraft({ ...draft, target: e.target.value })} />
      </div>
      <input style={{ ...S.input, fontSize: "12px", marginBottom: "6px" }} type="date"
        value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} />

      {error && <div style={{ fontSize: "11px", color: C.miss, marginBottom: "6px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "6px" }}>
        <button style={{ ...S.btn("primary"), flex: 1, padding: "8px", fontSize: "13px" }} onClick={save}>Assign</button>
        <button style={{ ...S.btn(), flex: 1, padding: "8px", fontSize: "13px" }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function NoteThread({ notes, myUserId, otherName, onAdd }) {
  const [body, setBody] = useState("");
  const ordered = sortNotes(notes);

  return (
    <>
      {ordered.length === 0 && (
        <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
          Nothing here yet. Both of you can write, and you both see everything.
        </div>
      )}
      {ordered.map(n => {
        const mine = n.authorId === myUserId;
        return (
          <div key={n.id} style={{
            padding: "8px 10px", marginBottom: "6px", borderRadius: "8px",
            backgroundColor: mine ? C.accentDim : C.surface,
            border: `1px solid ${mine ? C.accent + "33" : C.border}`,
          }}>
            <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "2px" }}>
              {mine ? "You" : otherName}{n.createdAt ? `, ${formatDate(n.createdAt.slice(0, 10))}` : ""}
            </div>
            <div style={{ fontSize: "12px", color: C.text }}>{n.body}</div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        <input style={{ ...S.input, flex: 1, fontSize: "12px" }} placeholder="Add a note…"
          value={body} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && body.trim()) { onAdd(body); setBody(""); } }} />
        <button style={{ ...S.btn(), padding: "8px 12px", fontSize: "12px" }}
          disabled={!body.trim()}
          onClick={() => { if (body.trim()) { onAdd(body); setBody(""); } }}>
          Post
        </button>
      </div>
    </>
  );
}

export default function CoachingView({
  setNextCoachingSession, onSetBowlerGoal, sessions, leagues,
  myUserId, relationships, profilesById, tasksByRelationship, notesByRelationship,
  coachViewOn, isCoach, onToggleCoachView,
  onSearch, searchResults, searching, onRequest, onRespond, onEnd,
  onAddTask, onRemoveTask, onCompleteTask, onAttemptTask, onReopenTask,
  onAddNote, leftHandedByUserId = {},
  onSelectBowler, bowlerSnapshots = {}, bowlerBreakdowns = {},
  unreadResponses = {}, onMarkResponsesSeen,
}) {
  const [goalDraft, setGoalDraft] = useState({ typeId: "", target: "" });
  const [selectedId, setSelectedId] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [requestAsCoach, setRequestAsCoach] = useState(false);

  const { myBowlers, myCoaches, incoming, outgoing } = categorizeCoaching(relationships, myUserId, profilesById);

  // In coach view you're looking at the people you coach; otherwise at
  // the people who coach you. Same screen, opposite side of the table.
  const list = coachViewOn ? myBowlers : myCoaches;

  // One row per coached bowler: current task, progress, next session.
  const roster = coachViewOn
    ? coachRoster({
        bowlers: myBowlers.map(b => ({
          name: b.displayName, relationshipId: b.relationshipId,
          nextSession: b.nextSession, nextSessionNote: b.nextSessionNote,
        })),
        tasks: Object.entries(tasksByRelationship || {})
          .flatMap(([relId, ts]) => (ts || []).map(t => ({ ...t, relationshipId: relId }))),
        sessions: sessions || [],
        leagues: leagues || [],
      })
    : [];
  const selected = list.find(x => x.relationshipId === selectedId) || list[0] || null;

  // Loads on-demand as each bowler is actually viewed, not eagerly for
  // everyone the coach has -- see loadCoachBowlerSessions in
  // BowlingTracker.jsx. Re-fires if the selection changes to a bowler
  // whose sessions haven't been fetched yet; loadCoachBowlerSessions
  // itself no-ops once a bowler's sessions are already cached.
  useEffect(() => {
    if (coachViewOn && selected && onSelectBowler) onSelectBowler(selected.userId);
  }, [coachViewOn, selected?.userId]);

  // Marked read when the coach is actually on this screen in coach view --
  // not when the data loads, which would clear the badge for someone who
  // never looked.
  useEffect(() => {
    if (coachViewOn && onMarkResponsesSeen) onMarkResponsesSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachViewOn]);
  const tasks = selected ? partitionTasks(tasksByRelationship?.[selected.relationshipId] || []) : null;
  const notes = selected ? (notesByRelationship?.[selected.relationshipId] || []) : [];
  const actingAsCoach = coachViewOn;
  const leftHanded = selected ? !!leftHandedByUserId[selected.userId] : false;

  return (
    <>
      {isCoach && coachViewOn && roster.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Your bowlers</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
            Everyone at a glance — what they're working on, how far along, and when you next see them.
          </div>
          {roster.map(r => (
            <div key={r.bowler} style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                <button onClick={() => setSelectedId(r.relationshipId)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                           fontSize: "14px", fontWeight: 600, color: C.text, textAlign: "left" }}>
                  {r.bowler}
                </button>
                <span style={{ fontSize: "11px", color: r.nextSession ? C.accent : C.textMuted, flexShrink: 0 }}>
                  {r.nextSession ? formatDate(r.nextSession) : "no session set"}
                </span>
              </div>

              {r.currentTask ? (
                <div style={{ fontSize: "12.5px", color: C.textMuted, marginTop: "3px" }}>
                  {r.currentTask.title}
                  {r.openTaskCount > 1 && ` (+${r.openTaskCount - 1} more)`}
                </div>
              ) : (
                <div style={{ fontSize: "12.5px", color: C.textMuted, marginTop: "3px" }}>Nothing assigned yet.</div>
              )}

              {/* Progress as a bar: a coach scanning six bowlers reads
                  bars faster than they read pairs of numbers. */}
              {r.progress && r.progress.reached != null && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px" }}>
                  <div style={{ flex: 1, height: "5px", background: C.border, borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "3px",
                                  width: `${Math.max(0, Math.min(100, Math.round((r.progress.reached / r.progress.target) * 100)))}%`,
                                  background: r.progress.met ? C.strike : C.spare }} />
                  </div>
                  <span style={{ fontSize: "11.5px", color: r.progress.met ? C.strike : C.textMuted, flexShrink: 0 }}>
                    {r.progress.reached}/{r.progress.target}{r.progress.met ? " ✓" : ""}
                  </span>
                </div>
              )}
              {r.progress && r.progress.reached == null && (
                <div style={{ fontSize: "11.5px", color: C.textMuted, marginTop: "5px" }}>
                  Target {r.progress.target}{r.progress.unit === "percent" ? "%" : ""} — no result logged yet.
                </div>
              )}

              {r.nextSessionNote && (
                <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px", fontStyle: "italic" }}>
                  {r.nextSessionNote}
                </div>
              )}
              {r.nextLeagueNight && (
                <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>
                  Bowls {r.nextLeague.replace(" House Shot", "")} on {formatDate(r.nextLeagueNight.toISOString().slice(0, 10))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isCoach && (
        <div style={S.card}>
          <div style={S.label}>View</div>
          <div style={S.chips}>
            <Chip label="I'm bowling" selected={!coachViewOn} onToggle={() => onToggleCoachView(false)} />
            <Chip label="I'm coaching" selected={coachViewOn} onToggle={() => onToggleCoachView(true)} color={C.spare} />
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>
            {coachViewOn
              ? "Showing the bowlers you coach."
              : "Showing your own game. Switch to see the people you coach."}
          </div>
        </div>
      )}

      {incoming.length > 0 && (
        <Section title="Requests" subtitle="Someone wants to connect.">
          {incoming.map(r => (
            <div key={r.relationshipId} style={{ padding: "10px", marginBottom: "8px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.spare}44` }}>
              <div style={{ fontSize: "13px", color: C.text, marginBottom: "6px" }}>
                <strong>{r.displayName}</strong> wants to be your {r.theirRole}.
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button style={{ ...S.btn("primary"), flex: 1, padding: "6px", fontSize: "12px" }}
                  onClick={() => onRespond(r.relationshipId, "accepted")}>Accept</button>
                <button style={{ ...S.btn(), flex: 1, padding: "6px", fontSize: "12px" }}
                  onClick={() => onRespond(r.relationshipId, "declined")}>Decline</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title="Waiting On Them">
          {outgoing.map(r => (
            <div key={r.relationshipId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", marginBottom: "6px" }}>
              <span style={{ color: C.textMuted }}>{r.displayName} — asked to be your {r.theirRole}</span>
              <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "11px", textDecoration: "underline" }}
                onClick={() => onEnd(r.relationshipId)}>Cancel</button>
            </div>
          ))}
        </Section>
      )}

      <Section
        title={coachViewOn ? "Your Bowlers" : "Your Coaches"}
        subtitle={list.length === 0 ? "Nobody connected yet." : undefined}>
        {list.length > 0 && (
          <div style={S.chips}>
            {list.map(x => (
              <Chip key={x.relationshipId}
                label={(unreadResponses[x.relationshipId]?.length ? "• " : "") + x.displayName}
                selected={selected?.relationshipId === x.relationshipId}
                onToggle={() => setSelectedId(x.relationshipId)} color={C.accent} />
            ))}
          </div>
        )}

        {/* Searches by display name, the only identifier the profiles
            table exposes. Email isn't available to look up, and asking for
            one that can't be matched would just fail silently. */}
        <div style={{ marginTop: list.length ? "10px" : 0 }}>
          <div style={{ ...S.label, marginBottom: "4px" }}>Connect with someone</div>
          <div style={{ ...S.chips, marginBottom: "6px" }}>
            <Chip label="They coach me" selected={!requestAsCoach} onToggle={() => setRequestAsCoach(false)} />
            <Chip label="I coach them" selected={requestAsCoach} onToggle={() => setRequestAsCoach(true)} />
          </div>
          <input style={{ ...S.input, fontSize: "12px", marginBottom: "6px" }}
            placeholder="Search by name…"
            value={searchTerm} onChange={e => { setSearchTerm(e.target.value); onSearch(e.target.value); }} />
          {searching && <div style={{ fontSize: "11px", color: C.textMuted }}>Searching…</div>}
          {!searching && searchTerm.trim() && (searchResults || []).length === 0 && (
            <div style={{ fontSize: "11px", color: C.textMuted }}>Nobody found by that name.</div>
          )}
          {(searchResults || []).map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
              <span style={{ fontSize: "12px", color: C.text }}>{p.display_name}</span>
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px" }}
                onClick={() => { onRequest(p, requestAsCoach); setSearchTerm(""); onSearch(""); }}>
                {requestAsCoach ? "Coach them" : "Ask to coach me"}
              </button>
            </div>
          ))}
        </div>
      </Section>

      {selected && (
        <>
          {/* Setting a goal for this bowler, from the roster.
          
              A coach could already assign a task, but not a goal -- and a
              goal is the thing with a number that tracks itself between
              sessions. Saved as the BOWLER's goal, not a separate
              coach-only copy, so you're both looking at one number. */}
          {actingAsCoach && onSetBowlerGoal && (
            <Section title={`Goal for ${selected.displayName}`}>
              {(selected.goals || []).length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  {(selected.goals || []).map(g => (
                    <div key={g.typeId} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      fontSize: "12px", padding: "4px 0",
                    }}>
                      <span style={{ color: C.text }}>{g.label}: {g.target}</span>
                      <button style={{ ...S.btn(), padding: "4px 9px", fontSize: "11px" }}
                        onClick={() => onSetBowlerGoal(selected.displayName, g.typeId, null)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={S.row}>
                <select style={S.sel} value={goalDraft.typeId}
                  onChange={e => setGoalDraft(d => ({ ...d, typeId: e.target.value }))}>
                  <option value="">Pick something to work on</option>
                  {GOAL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <input style={{ ...S.input, width: "80px", flexShrink: 0 }} type="number"
                  placeholder="Target" value={goalDraft.target}
                  onChange={e => setGoalDraft(d => ({ ...d, target: e.target.value }))} />
              </div>
              <button style={{ ...S.btn("primary"), marginTop: "8px" }}
                disabled={!goalDraft.typeId || !goalDraft.target}
                onClick={() => {
                  onSetBowlerGoal(selected.displayName, goalDraft.typeId, Number(goalDraft.target));
                  setGoalDraft({ typeId: "", target: "" });
                }}>
                Set this goal
              </button>
              <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>
                They'll see it on their Improve tab in bowling terms, and it tracks itself as they bowl.
              </div>
            </Section>
          )}

          {/* Scheduling the next session. Coach-only -- a bowler setting
              their coach's calendar isn't the relationship this models. */}
          {actingAsCoach && setNextCoachingSession && (
            <Section title={`Next session with ${selected.displayName}`}>
              <div style={S.row}>
                <input style={{ ...S.input, flex: 1 }} type="date"
                  value={selected.nextSession || ""}
                  onChange={e => setNextCoachingSession(selected.relationshipId, e.target.value, selected.nextSessionNote || "")} />
                {selected.nextSession && (
                  <button style={{ ...S.btn(), flexShrink: 0 }}
                    onClick={() => setNextCoachingSession(selected.relationshipId, "", "")}>
                    Clear
                  </button>
                )}
              </div>
              <input style={{ ...S.input, marginTop: "8px" }}
                placeholder="Where and when, e.g. 6pm lanes 9-10 at Sunset"
                defaultValue={selected.nextSessionNote || ""}
                onBlur={e => setNextCoachingSession(selected.relationshipId, selected.nextSession || "", e.target.value)} />
              <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px" }}>
                Shows on your roster above. Leave it blank if you work session to session.
              </div>
            </Section>
          )}

          {actingAsCoach && (
            <Section title={`${selected.displayName}'s Game`}>
              {(() => {
                const snap = bowlerSnapshots[selected.userId];
                if (snap === undefined) {
                  return <div style={{ fontSize: "11px", color: C.textMuted }}>Loading…</div>;
                }
                if (snap === null) {
                  return <div style={{ fontSize: "11px", color: C.textMuted }}>Nothing bowled yet. Their scores appear here once they save a session.</div>;
                }
                return (
                  <>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                      <div style={S.statBox}>
                        <div style={{ ...S.statNum, fontSize: "18px" }}>{snap.average}</div>
                        <div style={S.statLbl}>Average</div>
                      </div>
                      <div style={S.statBox}>
                        <div style={{ ...S.statNum, fontSize: "18px", color: C.strike }}>{snap.high}</div>
                        <div style={S.statLbl}>High</div>
                      </div>
                      <div style={S.statBox}>
                        <div style={{ ...S.statNum, fontSize: "18px", color: C.textMuted }}>{snap.nights}</div>
                        <div style={S.statLbl}>Nights</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: C.text, marginBottom: "10px" }}>{snap.trendSummary}</div>
                    {(() => {
                      // The "why" behind the scores -- 11 of 14 coaches
                      // asked for this. Absent when the shots policy
                      // isn't in place yet, or when the bowler tracks
                      // scores-only; either way the scores above still
                      // stand on their own.
                      const b = bowlerBreakdowns[selected.userId];
                      if (!b) return null;
                      const rate = (v, sample, label) => (
                        <div key={label} style={S.statBox}>
                          <div style={{ ...S.statNum, fontSize: "15px", color: v == null ? C.textMuted : C.text }}>
                            {v == null ? "—" : `${v}%`}
                          </div>
                          <div style={S.statLbl}>{label}</div>
                          <div style={{ fontSize: "9px", color: C.textMuted, marginTop: "2px" }}>{sample}</div>
                        </div>
                      );
                      return (
                        <div style={{ marginBottom: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
                          <div style={{ ...S.label, marginBottom: "6px" }}>From {b.shots} shots</div>
                          <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                            {rate(b.strikeRate, b.strikeSample, "Strike")}
                            {rate(b.spareRate, b.spareSample, "Spare")}
                            {rate(b.cornerPinRate, b.cornerPinSample, b.cornerPinLabel)}
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {rate(b.singlePinRate, b.singlePinSample, "Single Pin")}
                            {rate(b.splitRate, b.frames, "Split")}
                          </div>
                          {b.misses.length > 0 && (
                            <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "8px" }}>
                              Misses: {b.misses.slice(0, 4).map(m => `${m.miss} ${m.count}`).join(" · ")}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {snap.recent.length > 0 && (
                      <div>
                        <div style={{ ...S.label, marginBottom: "4px" }}>Recent</div>
                        {snap.recent.map((r, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                            <span style={{ color: C.textMuted }}>{r.league ? `${r.league}, ` : ""}{formatDate(r.date)}</span>
                            <span style={{ color: C.text }}>{r.scores.join(" · ")}{r.total != null ? `  (${r.total})` : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </Section>
          )}

          <Section title={`Tasks — ${selected.displayName}`}>
            {actingAsCoach && !addingTask && (
              <button style={{ ...S.btn(), width: "100%", marginBottom: "8px", padding: "8px", fontSize: "12px" }}
                onClick={() => setAddingTask(true)}>
                + Assign a task
              </button>
            )}
            {actingAsCoach && addingTask && (
              <NewTask leftHanded={leftHanded}
                onAdd={t => { onAddTask(selected.relationshipId, t); setAddingTask(false); }}
                onCancel={() => setAddingTask(false)} />
            )}

            {tasks.open.length === 0 && tasks.completed.length === 0 && tasks.attempted.length === 0 && (
              <div style={{ fontSize: "11px", color: C.textMuted }}>No tasks yet — set one above and it'll show in their inbox.</div>
            )}

            {tasks.open.map(t => (
              <TaskRow key={t.id} task={t} isCoach={actingAsCoach} leftHanded={leftHanded}
                onComplete={x => onCompleteTask(selected.relationshipId, x)}
                onAttempt={(x, r, n) => onAttemptTask(selected.relationshipId, x, r, n)}
                onReopen={x => onReopenTask(selected.relationshipId, x)}
                onRemove={actingAsCoach ? x => onRemoveTask(selected.relationshipId, x) : null} />
            ))}

            {(tasks.attempted.length > 0 || tasks.completed.length > 0) && (
              <div style={{ ...S.label, marginTop: "10px", marginBottom: "6px" }}>Done &amp; Attempted</div>
            )}
            {[...tasks.attempted, ...tasks.completed].map(t => (
              <TaskRow key={t.id} task={t} isCoach={actingAsCoach} leftHanded={leftHanded}
                onComplete={x => onCompleteTask(selected.relationshipId, x)}
                onAttempt={(x, r, n) => onAttemptTask(selected.relationshipId, x, r, n)}
                onReopen={x => onReopenTask(selected.relationshipId, x)}
                onRemove={actingAsCoach ? x => onRemoveTask(selected.relationshipId, x) : null} />
            ))}
          </Section>

          <Section title="Notes" subtitle="Both of you can read and write here.">
            <NoteThread notes={notes} myUserId={myUserId} otherName={selected.displayName}
              onAdd={body => onAddNote(selected.relationshipId, body)} />
          </Section>

          <button style={{ ...S.btn("warn"), width: "100%" }} onClick={() => onEnd(selected.relationshipId)}>
            End coaching relationship
          </button>
          <div style={{ height: "24px" }} />
        </>
      )}
    </>
  );
}
