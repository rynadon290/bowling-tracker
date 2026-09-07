import { useState } from "react";
import { C, S } from "./ui.jsx";
import {
  GOAL_TYPES, goalTypeFor, minSampleFor, setGoal, removeGoal, allGoalProgress,
} from "./domain/goals.js";

function formatValue(value, unit) {
  if (value == null) return "—";
  return unit === "percent" ? `${Math.round(value)}%` : `${Math.round(value)}`;
}

// One goal's progress row.
//
// Three distinct states, kept visually distinct on purpose:
//   met      - target reached
//   tracking - a real number against the target
//   gated    - not enough data yet, so NO number is shown at all
//
// The gated state is the one that matters. Showing "62% — 3% to go" off
// eleven attempts invites a bowler to change their game over noise, so
// until the sample is there this says what it's still waiting for instead.
function GoalRow({ progress, onRemove }) {
  const { label, unit, target, current, pct, met, gated, noData, remaining, sampleNoun, shortBy } = progress;

  const barColor = met ? C.strike : gated || noData ? C.border : C.accent;

  return (
    <div style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px", gap: "8px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>
          {label}
          {met && <span style={{ color: C.strike, marginLeft: "6px", fontSize: "12px" }}>✓ reached</span>}
        </div>
        <div style={{ fontSize: "12px", color: C.textMuted, flexShrink: 0 }}>
          {gated || noData ? "goal " : ""}{formatValue(target, unit)}
        </div>
      </div>

      {gated ? (
        <div style={{ fontSize: "11px", color: C.textMuted }}>
          Not enough data yet — {remaining} more {sampleNoun} before this is worth reporting.
        </div>
      ) : noData ? (
        <div style={{ fontSize: "11px", color: C.textMuted }}>
          Nothing logged for this yet.
        </div>
      ) : (
        <>
          <div style={{ height: "8px", backgroundColor: C.surface, borderRadius: "4px", overflow: "hidden", marginBottom: "4px" }}>
            <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: "4px" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: C.textMuted }}>
            <span>
              Now: <strong style={{ color: C.text }}>{formatValue(current, unit)}</strong>
            </span>
            <span>
              {met ? "Target met" : `${formatValue(shortBy, unit)} to go`}
            </span>
          </div>
        </>
      )}

      {onRemove && (
        <button
          style={{ background: "none", border: "none", padding: 0, marginTop: "6px", fontSize: "11px", color: C.textMuted, cursor: "pointer", textDecoration: "underline" }}
          onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  );
}

export default function GoalsPanel({ goals, measurements, onChange, leftHanded = false }) {
  const [adding, setAdding] = useState(false);
  const [pickedType, setPickedType] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");

  const progress = allGoalProgress(goals, measurements, leftHanded);
  const used = new Set((goals || []).map(g => g.typeId));
  // Labelled for this bowler's hand -- a lefty picking a corner-pin goal
  // should see "7 Pin Spare %" in the list, not "10 Pin".
  const available = GOAL_TYPES.filter(t => !used.has(t.id)).map(t => goalTypeFor(t.id, leftHanded));
  const picked = goalTypeFor(pickedType, leftHanded);

  function save() {
    if (!picked) { setError("Pick a statistic first."); return; }
    const n = Number(target);
    if (!Number.isFinite(n)) { setError("Enter a number."); return; }
    // Mirrors normalizeGoal's rejection rather than clamping, so the
    // bowler is told their number was out of range instead of quietly
    // getting a different one.
    if (n < picked.min || n > picked.max) {
      setError(`${picked.label} targets run from ${picked.min} to ${picked.max}.`);
      return;
    }
    onChange(setGoal(goals, picked.id, n));
    setAdding(false); setPickedType(""); setTarget(""); setError("");
  }

  return (
    <div style={S.card}>
      <div style={S.label}>Goals</div>

      {progress.length === 0 && !adding && (
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Set a target for a statistic you're working on and track progress against it.
        </div>
      )}

      {progress.map(p => (
        <GoalRow key={p.typeId} progress={p} onRemove={() => onChange(removeGoal(goals, p.typeId))} />
      ))}

      {!adding && available.length > 0 && (
        <button
          style={{ background: "none", border: "none", padding: 0, fontSize: "12px", color: C.accent, cursor: "pointer", textDecoration: "underline" }}
          onClick={() => { setAdding(true); setError(""); }}>
          + Add a goal
        </button>
      )}
      {!adding && available.length === 0 && (
        <div style={{ fontSize: "11px", color: C.textMuted }}>
          You've set a goal for every statistic available.
        </div>
      )}

      {adding && (
        <div style={{ marginTop: "8px", padding: "10px", backgroundColor: C.surface, borderRadius: "8px", border: `1px solid ${C.border}` }}>
          <div style={{ ...S.label, marginBottom: "6px" }}>Statistic</div>
          <select
            style={{ ...S.sel, width: "100%", marginBottom: "8px" }}
            value={pickedType}
            onChange={e => { setPickedType(e.target.value); setError(""); }}>
            <option value="">Choose one…</option>
            {available.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>

          {picked && (
            <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
              {picked.help}
              {minSampleFor(picked) > 0 && (
                <> Needs {minSampleFor(picked)} {picked.sampleNoun} before progress is shown.</>
              )}
            </div>
          )}

          <div style={{ ...S.label, marginBottom: "6px" }}>
            Target{picked ? ` (${picked.min}–${picked.max}${picked.unit === "percent" ? "%" : ""})` : ""}
          </div>
          <input
            style={{ ...S.input, marginBottom: "8px" }}
            type="number"
            inputMode="numeric"
            placeholder={picked ? String(picked.min) : "—"}
            value={target}
            onChange={e => { setTarget(e.target.value); setError(""); }} />

          {error && <div style={{ fontSize: "11px", color: C.miss, marginBottom: "8px" }}>{error}</div>}

          <div style={{ display: "flex", gap: "6px" }}>
            <button style={{ ...S.btn("primary"), flex: 1, padding: "8px", fontSize: "13px" }} onClick={save}>Save</button>
            <button style={{ ...S.btn(), flex: 1, padding: "8px", fontSize: "13px" }}
              onClick={() => { setAdding(false); setPickedType(""); setTarget(""); setError(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
