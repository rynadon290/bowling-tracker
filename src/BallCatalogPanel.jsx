import { C, S, Chip } from "./ui.jsx";
import {
  catalogState, canVote, canEdit, isLocked, approvalsUntilNext,
  stateDescription, STATE_LABELS, bestEntry, ballKey,
} from "./domain/ballCatalog.js";
import { describeSpecs } from "./domain/ballSpecs.js";

const STATE_COLORS = {
  official: C.accent,
  new: C.textMuted,
  approved: C.spare,
  verified: C.strike,
  rejected: C.miss,
};

// Specs other bowlers have submitted for this ball.
//
// The disclaimer is not decoration: these numbers came from a stranger, not
// a manufacturer, and a bowler about to trust an RG figure should know that.
// Nothing here writes to their arsenal without an explicit tap.
export default function BallCatalogPanel({
  ballName, userId, entries, myOwnSpecs,
  onApply, onPublish, onVote,
}) {
  const key = ballKey(ballName);
  const list = entries || [];
  const live = list.filter(e => catalogState(e) !== "rejected");
  const mine = list.find(e => e.submittedBy === userId);
  const suggested = bestEntry(live);

  return (
    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ ...S.label, marginBottom: "4px" }}>Community Specs</div>

      {live.length === 0 && (
        <>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
            Nobody has shared specs for this ball yet. If you've filled yours in, you can share them so other bowlers don't have to type them.
          </div>
          {!mine && (
            <button style={{ ...S.btn(), width: "100%" }} onClick={() => onPublish(ballName, myOwnSpecs)}>
              Share My Specs
            </button>
          )}
        </>
      )}

      {live.map(entry => {
        const state = catalogState(entry);
        const isMine = entry.submittedBy === userId;
        const votable = canVote(entry, userId);
        const remaining = approvalsUntilNext(entry);
        return (
          <div key={entry.id} style={{ marginBottom: "10px", padding: "8px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${STATE_COLORS[state]}44` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: STATE_COLORS[state], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {STATE_LABELS[state]}
              </span>
              {isMine && <span style={{ fontSize: "10px", color: C.textMuted }}>Yours</span>}
            </div>

            <div style={{ fontSize: "12px", color: C.text, marginBottom: "4px" }}>
              {describeSpecs(entry.specs) || "No details recorded"}
            </div>

            {/* Provenance. A bowler trusting these numbers needs to know
                where they came from. */}
            <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "6px" }}>
              {stateDescription(entry)}
              {remaining !== null && remaining > 0 && (
                <> · {remaining} more {remaining === 1 ? "confirmation" : "confirmations"} to {state === "new" ? "approve" : "verify"}</>
              )}
            </div>

            <div style={S.chips}>
              <Chip label="Use These" dense onToggle={() => onApply(entry.specs)} color={C.accent} />
              {votable && (
                <>
                  <Chip label={entry.myVote === "approve" ? "✓ Looks right" : "Looks right"} dense
                    selected={entry.myVote === "approve"} color={C.strike}
                    onToggle={() => onVote(key, entry.id, "approve")} />
                  <Chip label={entry.myVote === "reject" ? "✓ Wrong" : "Wrong"} dense
                    selected={entry.myVote === "reject"} color={C.miss}
                    onToggle={() => onVote(key, entry.id, "reject")} />
                </>
              )}
              {isMine && !isLocked(entry) && (
                <Chip label="Update Shared" dense onToggle={() => onPublish(ballName, myOwnSpecs)} />
              )}
            </div>

            {isMine && isLocked(entry) && (
              <div style={{ fontSize: "10px", color: C.textMuted, marginTop: "6px" }}>
                Locked — enough bowlers have confirmed these that they can't be edited.
              </div>
            )}
            {!votable && !isMine && state !== "verified" && (
              <div style={{ fontSize: "10px", color: C.textMuted, marginTop: "6px" }}>
                Voting closed.
              </div>
            )}
          </div>
        );
      })}

      {live.length > 0 && !mine && (
        <button style={{ ...S.btn(), width: "100%", fontSize: "12px" }} onClick={() => onPublish(ballName, myOwnSpecs)}>
          Share Mine Instead
        </button>
      )}
    </div>
  );
}
