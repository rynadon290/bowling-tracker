import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  DRILL_TARGETS, targetLabel, recordMade, recordMissed, undo,
  attempts, conversionRate, targetHistory,
} from "./domain/drills.js";

// Big two-button tapping. This runs while someone is standing on the
// approach between shots, so everything is oversized and the rate is
// always visible without scrolling.
export default function DrillSession({ drill, onChange, onSave, saved, balls, drills, bowler }) {
  const [lastTap, setLastTap] = useState(null);
  const rate = conversionRate(drill);
  const n = attempts(drill);
  const history = targetHistory(drills || [], bowler, drill.target);
  const prev = history.length ? history[history.length - 1] : null;

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>Drill</div>
        <div style={S.chips}>
          {DRILL_TARGETS.map(t => (
            <Chip key={t.id} label={t.short} dense selected={drill.target === t.id}
              onToggle={() => onChange({ ...drill, target: t.id, made: 0, missed: 0 })} />
          ))}
        </div>
        {drill.target === "custom" && (
          <input style={{ ...S.input, marginTop: "6px" }} placeholder="What are you shooting at?"
            value={drill.customTarget} onChange={e => onChange({ ...drill, customTarget: e.target.value })} />
        )}
        {(balls || []).length > 0 && (
          <>
            <div style={{ ...S.label, marginTop: "10px" }}>Ball</div>
            <div style={S.chips}>
              {balls.map(b => (
                <Chip key={b} label={b} dense selected={drill.ball === b}
                  onToggle={() => onChange({ ...drill, ball: drill.ball === b ? "" : b })} />
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ ...S.card, textAlign: "center", border: `1px solid ${C.accent}44` }}>
        <div style={{ fontSize: "11px", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {targetLabel(drill.target, drill.customTarget)}
        </div>
        <div style={{ fontSize: "48px", fontWeight: 700, color: rate === null ? C.textMuted : rate >= 80 ? C.strike : rate >= 60 ? C.spare : C.miss, lineHeight: 1.1, margin: "8px 0" }}>
          {rate === null ? "—" : `${rate}%`}
        </div>
        <div style={{ fontSize: "13px", color: C.textMuted }}>
          {drill.made} of {n} {n === 1 ? "attempt" : "attempts"}
          {prev && n >= 5 && (
            <span style={{ color: rate >= prev.rate ? C.strike : C.miss }}>
              {" "}· last time {prev.rate}%
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button style={{ ...S.btn("primary"), flex: 1, padding: "20px", fontSize: "18px", backgroundColor: C.strike }}
            onClick={() => { onChange(recordMade(drill)); setLastTap(true); }}>
            ✓ Made
          </button>
          <button style={{ ...S.btn("primary"), flex: 1, padding: "20px", fontSize: "18px", backgroundColor: C.miss }}
            onClick={() => { onChange(recordMissed(drill)); setLastTap(false); }}>
            ✗ Missed
          </button>
        </div>
        {lastTap !== null && n > 0 && (
          <button style={{ ...S.btn(), marginTop: "8px", fontSize: "11px", padding: "6px 12px" }}
            onClick={() => { onChange(undo(drill, lastTap)); setLastTap(null); }}>
            Undo last
          </button>
        )}
      </div>

      <div style={S.card}>
        <textarea style={{ ...S.input, minHeight: "50px", resize: "vertical" }}
          placeholder="Notes — what worked, what to try next time…"
          value={drill.notes} onChange={e => onChange({ ...drill, notes: e.target.value })} />
      </div>

      <button style={S.btn("primary")} onClick={onSave} disabled={n === 0}>
        {saved ? "✓ Drill Saved" : n === 0 ? "Throw a few first" : `Save Drill (${n} attempts)`}
      </button>

      {history.length > 1 && (
        <div style={{ ...S.card, marginTop: "12px" }}>
          <div style={S.label}>{targetLabel(drill.target, drill.customTarget)} over time</div>
          {history.slice(-6).map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ color: C.textMuted }}>{h.date}{h.ball ? ` · ${h.ball}` : ""}</span>
              <span style={{ fontWeight: 600, color: h.rate >= 80 ? C.strike : h.rate >= 60 ? C.spare : C.miss }}>{h.rate}% <span style={{ color: C.textMuted, fontWeight: 400 }}>({h.attempts})</span></span>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: "32px" }} />
    </div>
  );
}
