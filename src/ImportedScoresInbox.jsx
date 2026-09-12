import { useState } from "react";
import { C, S } from "./ui.jsx";
import { formatDate } from "./constants.js";
import {
  effectiveScores, isConfirmed, describeStatus, pendingFor, needingReentry,
  importConflicts, importConflictNote,
} from "./domain/importVerification.js";

// Scores someone else imported from a scorecard photo, waiting on this
// bowler to confirm them.
//
// The important framing, which the copy has to carry: these scores are
// ALREADY counting. Silence is acceptance, because a team average can't
// sit unresolved waiting on the one member who bowls and goes home. So
// this is not "approve these or they're lost" -- it's "check these, they
// look like this to everyone right now."

function ScoreRow({ label, scores, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "2px" }}>
      <span style={{ color: C.textMuted }}>{label}</span>
      <span style={{ color: muted ? C.textMuted : C.text, fontWeight: muted ? 400 : 600 }}>
        {scores.filter(v => v != null).join(" · ") || "—"}
      </span>
    </div>
  );
}

function PendingCard({ record, onApprove, onReject, myScoresByGame }) {
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState((record.importedScores || []).map(v => (v == null ? "" : String(v))));

  const scores = effectiveScores(record) || [];
  // Where the photo disagrees with what this bowler already typed.
  //
  // Silence is right when they agree -- the photo just confirms it. When
  // they differ, one is wrong and only the bowler can say which: a photo
  // can be misread, and so can a phone keypad at the end of a long
  // night. Their entry is still kept by default.
  const conflicts = importConflicts(record, myScoresByGame);

  return (
    <div style={{ padding: "12px", marginBottom: "10px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.spare}44` }}>
      <div style={{ fontSize: "13px", color: C.text, marginBottom: "2px" }}>
        {record.league ? `${record.league.replace(" House Shot", "")} · ` : ""}{formatDate(record.date)}
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
        Imported from a teammate's scorecard photo. These are already counting — confirming just marks them checked.
      </div>
      {conflicts.length > 0 && (
        <div style={{ fontSize: "11px", color: C.miss, lineHeight: 1.5, marginBottom: "8px" }}>
          ⚠️ {importConflictNote(conflicts)}
        </div>
      )}
      <ScoreRow label="Scores read" scores={scores} />

      {/* Frames come with the photo when the scorecard showed them, but
          nothing is written to this bowler's shot history until they
          confirm -- and once written, each shot is marked as imported so
          it's never mistaken for one they logged themselves. */}
      {(record.importedShots || []).length > 0 && (
        <div style={{ fontSize: "11px", color: C.accent, marginTop: "8px" }}>
          Frame-by-frame data included for {record.importedShots.length}{" "}
          {record.importedShots.length === 1 ? "game" : "games"} — confirming adds it to your shot history.
        </div>
      )}

      {!correcting && (
        <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
          <button style={{ ...S.btn("primary"), flex: 1, padding: "8px", fontSize: "12px" }}
            onClick={() => onApprove(record)}>
            These are right
          </button>
          <button style={{ ...S.btn(), flex: 1, padding: "8px", fontSize: "12px" }}
            onClick={() => setCorrecting(true)}>
            Fix them
          </button>
        </div>
      )}

      {correcting && (
        <div style={{ marginTop: "10px" }}>
          <div style={{ ...S.label, marginBottom: "6px" }}>What were they actually?</div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            {draft.map((v, i) => (
              <input key={i} style={{ ...S.input, flex: 1, textAlign: "center", fontSize: "14px" }}
                type="number" inputMode="numeric" placeholder={`G${i + 1}`}
                value={v} onChange={e => setDraft(d => d.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button style={{ ...S.btn("primary"), flex: 1, padding: "8px", fontSize: "12px" }}
              onClick={() => { onReject(record, draft); setCorrecting(false); }}>
              Save corrections
            </button>
            {/* Rejecting with nothing withdraws the scores entirely --
                they stop counting and someone re-enters them. Worth being
                explicit that this is different from correcting. */}
            <button style={{ ...S.btn("warn"), flex: 1, padding: "8px", fontSize: "12px" }}
              onClick={() => { onReject(record, null); setCorrecting(false); }}>
              None of these are mine
            </button>
          </div>
          <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "11px", textDecoration: "underline", padding: 0, marginTop: "8px" }}
            onClick={() => setCorrecting(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// The unified inbox: everything outstanding, in one list.
//
// Items that another screen already owns are links -- the inbox does not
// re-implement accepting a coaching invitation, because two places that
// can accept one is two places that can disagree about whether it was
// accepted. Imported scores are the exception: this screen owns them, so
// they're actioned here.
export function InboxList({ items, onOpen }) {
  if (!items?.length) return null;
  return (
    <div style={S.card}>
      <div style={S.label}>Needs You</div>
      {items.filter(i => i.view !== "inbox").map(item => (
        <button key={item.id}
          style={{
            display: "block", width: "100%", textAlign: "left", cursor: "pointer",
            padding: "10px", marginBottom: "8px", borderRadius: "8px",
            backgroundColor: C.surface, border: `1px solid ${C.border}`,
          }}
          onClick={() => onOpen(item)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>{item.title}</span>
            <span style={{ fontSize: "11px", color: C.accent, flexShrink: 0 }}>Open ›</span>
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>{item.detail}</div>
        </button>
      ))}
    </div>
  );
}

// Team invites are answered here rather than linked out, because the
// Social tab only ever showed the captain's side.
export function TeamInviteCard({ invite, onAccept, onDecline, busy }) {
  return (
    <div style={{ padding: "12px", marginBottom: "10px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.accent}44` }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>
        Join {invite.teamName || "this team"}?
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px", marginBottom: "10px" }}>
        You were added to the roster as {invite.invitedName || "a member"}
        {invite.lineupPosition != null ? `, position ${invite.lineupPosition + 1}` : ""}.
        Teammates will be able to import your scores from a scorecard photo — you still confirm them.
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <button style={{ ...S.btn("primary"), flex: 1, padding: "8px", fontSize: "12px" }}
          disabled={busy} onClick={() => onAccept(invite)}>
          {busy ? "Joining…" : "Join team"}
        </button>
        <button style={{ ...S.btn(), flex: 1, padding: "8px", fontSize: "12px" }}
          disabled={busy} onClick={() => onDecline(invite)}>
          No thanks
        </button>
      </div>
    </div>
  );
}

export default function ImportedScoresInbox({
  records, bowler, onApprove, onReject, onCorrectTeammate, canCorrect,

  teamInvites = [], onAcceptInvite, onDeclineInvite, inviteBusyId,

  // What this bowler has already logged, keyed "league|date" -> { game:
  // score }. Used to spot where the photo disagrees with them.
  myScores = {},

}) {
  const [correctingId, setCorrectingId] = useState(null);
  const [draft, setDraft] = useState([]);
  const [error, setError] = useState(null);

  const mine = pendingFor(records, bowler);
  const reentry = needingReentry(records).filter(r => r.bowler === bowler);
  // Teammates' records this bowler may be able to fix, because the person
  // they belong to never responded.
  const stale = (records || []).filter(r =>
    r.bowler !== bowler && r.status === "pending" && canCorrect && canCorrect(r).allowed);

  if (!mine.length && !reentry.length && !stale.length && !teamInvites.length) return null;

  return (
    <>
      {teamInvites.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Team {teamInvites.length === 1 ? "Invitation" : "Invitations"}</div>
          {teamInvites.map(inv => (
            <TeamInviteCard key={inv.id} invite={inv}
              onAccept={onAcceptInvite} onDecline={onDeclineInvite}
              busy={inviteBusyId === inv.id} />
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Scores To Check</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
            {mine.length} night{mine.length === 1 ? "" : "s"} imported by a teammate.
          </div>
          {mine.map(r => (
            <PendingCard key={r.id} record={r} onApprove={onApprove} onReject={onReject}
              myScoresByGame={myScores[`${r.league ?? ""}|${r.date ?? ""}`] || {}} />
          ))}
        </div>
      )}

      {reentry.length > 0 && (
        <div style={{ ...S.card, border: `1px solid ${C.miss}44` }}>
          <div style={{ ...S.label, color: C.miss }}>Needs Re-entering</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
            You said these weren't yours, so they've stopped counting. Enter them on the Log tab when you have them.
          </div>
          {reentry.map(r => (
            <div key={r.id} style={{ fontSize: "12px", color: C.textMuted, marginBottom: "4px" }}>
              {r.league ? `${r.league.replace(" House Shot", "")} · ` : ""}{formatDate(r.date)}
            </div>
          ))}
        </div>
      )}

      {stale.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Waiting On Teammates</div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
            These haven't been confirmed and a session has since finished. You can correct them if you know the real scores.
          </div>
          {stale.map(r => {
            const scores = effectiveScores(r) || [];
            return (
              <div key={r.id} style={{ padding: "10px", marginBottom: "8px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{r.bowler}</div>
                <ScoreRow label={r.date} scores={scores} muted />
                {correctingId !== r.id ? (
                  <button style={{ ...S.btn(), width: "100%", padding: "6px", fontSize: "12px", marginTop: "6px" }}
                    onClick={() => { setCorrectingId(r.id); setDraft(scores.map(v => String(v ?? ""))); setError(null); }}>
                    Correct these
                  </button>
                ) : (
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                      {draft.map((v, i) => (
                        <input key={i} style={{ ...S.input, flex: 1, textAlign: "center", fontSize: "14px" }}
                          type="number" inputMode="numeric" placeholder={`G${i + 1}`}
                          value={v} onChange={e => setDraft(d => d.map((x, j) => (j === i ? e.target.value : x)))} />
                      ))}
                    </div>
                    {error && <div style={{ fontSize: "11px", color: C.miss, marginBottom: "6px" }}>{error}</div>}
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button style={{ ...S.btn("primary"), flex: 1, padding: "6px", fontSize: "12px" }}
                        onClick={() => {
                          const err = onCorrectTeammate(r, draft);
                          if (err) setError(err); else setCorrectingId(null);
                        }}>
                        Save
                      </button>
                      <button style={{ ...S.btn(), flex: 1, padding: "6px", fontSize: "12px" }}
                        onClick={() => setCorrectingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Small enough to show inline next to a team's scores: whether a night's
// numbers are confirmed or still just imported.
export function ImportStatusTag({ record }) {
  if (!record) return null;
  const confirmed = isConfirmed(record);
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "10px",
      backgroundColor: (confirmed ? C.strike : C.spare) + "22",
      color: confirmed ? C.strike : C.spare,
    }} title={describeStatus(record)}>
      {confirmed ? "confirmed" : "unconfirmed"}
    </span>
  );
}
