import { C, S } from "./ui.jsx";
import { searchCatalog, catalogState, STATE_LABELS } from "./domain/ballCatalog.js";
import { describeSpecs } from "./domain/ballSpecs.js";

const STATE_COLORS = {
  official: C.accent,
  new: C.textMuted,
  approved: C.spare,
  verified: C.strike,
  rejected: C.miss,
};

// The "add a ball" field, with suggestions from the community catalog.
//
// Picking a suggestion adds the ball AND its specs in one step, which is the
// point -- typing "Phaze II" shouldn't also mean typing RG 2.48 by hand when
// someone already has. Typing a name nobody has submitted still works
// exactly as before: the ball is added with no specs, which is the case a
// catalog can never cover.
export default function BallNameInput({
  value, onChange, onAdd, catalogEntries, existingBalls,
}) {
  const owned = new Set((existingBalls || []).map(b => b.toLowerCase().trim()));
  const suggestions = searchCatalog(value, catalogEntries || {})
    // Don't suggest balls already in the arsenal -- adding them again is a
    // no-op and just clutters the list.
    .filter(e => !owned.has(e.ballName.toLowerCase().trim()));

  return (
    <div>
      <div style={S.row}>
        <input style={{ ...S.input, flex: 1 }}
          placeholder="Add a ball (e.g. Storm Phaze II)"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onAdd(); }} />
        <button style={S.btn("sm")} onClick={() => onAdd()}>+</button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: "6px", border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ fontSize: "10px", color: C.textMuted, padding: "6px 10px", backgroundColor: C.surface, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            From other bowlers
          </div>
          {suggestions.map(entry => {
            const state = catalogState(entry);
            const specText = describeSpecs(entry.specs);
            return (
              <button key={entry.id}
                style={{
                  display: "block", width: "100%", textAlign: "left", background: "none",
                  border: "none", borderTop: `1px solid ${C.border}`, padding: "8px 10px",
                  cursor: "pointer", color: C.text,
                }}
                onClick={() => onAdd(entry.ballName, entry.specs)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{entry.ballName}</span>
                  <span style={{ fontSize: "9px", color: STATE_COLORS[state], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {STATE_LABELS[state]}
                  </span>
                </div>
                {specText && (
                  <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>{specText}</div>
                )}
              </button>
            );
          })}
          <div style={{ fontSize: "10px", color: C.textMuted, padding: "6px 10px", borderTop: `1px solid ${C.border}` }}>
            Specs entered by other bowlers, not manufacturer data — check them after adding.
          </div>
        </div>
      )}
    </div>
  );
}
