import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  LAYOUT_SYSTEMS, LAYOUT_SYSTEM_LABELS, LAYOUT_FIELDS,
  emptyLayout, normalizeLayout, formatLayout, layoutFieldErrors,
  setLayoutSystem, setLayoutValue,
} from "./domain/layouts.js";

// Editor for one ball's drilling layout. The three systems each get their
// own labeled fields, because their numbers measure different reference
// points -- a generic "three numbers" form would silently let someone
// record a VLS layout under Dual Angle labels and never notice.
function LayoutEditor({ layout, onChange }) {
  const current = normalizeLayout(layout) || emptyLayout();
  const errors = layoutFieldErrors(current);

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ ...S.label, marginBottom: "6px" }}>Layout System</div>
      <div style={S.chips}>
        {LAYOUT_SYSTEMS.map(sys => (
          <Chip key={sys} label={LAYOUT_SYSTEM_LABELS[sys]} dense
            selected={current.system === sys}
            onToggle={() => onChange(setLayoutSystem(current, sys))} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        {LAYOUT_FIELDS[current.system].map(f => (
          <div key={f.key} style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "3px" }}>
              {f.label} ({f.unit})
            </div>
            <input
              style={{
                ...S.input, fontSize: "13px", padding: "6px 8px",
                border: `1px solid ${errors[f.key] ? C.miss : C.border}`,
              }}
              type="number" step={f.step} inputMode="decimal"
              placeholder={f.unit}
              value={current.values[f.key]}
              onChange={e => onChange(setLayoutValue(current, f.key, e.target.value))} />
            {errors[f.key] && (
              <div style={{ fontSize: "10px", color: C.miss, marginTop: "2px" }}>{errors[f.key]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// The arsenal list. Each ball is its own row rather than a bare chip,
// because a ball now carries a layout worth showing at a glance -- and
// because removal deserves an explicit button rather than "tapping the
// ball itself deletes it", which is easy to do by accident on a phone.
export default function ArsenalList({ activeBowler, balls, ballLayouts, setBallLayout, removeBall }) {
  const [openBall, setOpenBall] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  if (!balls.length) {
    return (
      <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "8px" }}>
        Add {activeBowler}'s balls to start logging shots.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "10px" }}>
      {balls.map(ball => {
        const key = `${activeBowler}|${ball}`;
        const layout = ballLayouts[key];
        const summary = formatLayout(layout);
        const isOpen = openBall === ball;
        return (
          <div key={ball} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "8px", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{ball}</div>
                <div style={{ fontSize: "11px", color: summary ? C.accent : C.textMuted, marginTop: "2px" }}>
                  {summary || "No layout recorded"}
                </div>
              </div>
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "11px" }}
                onClick={() => setOpenBall(isOpen ? null : ball)}>
                {isOpen ? "Done" : summary ? "Edit" : "Add Layout"}
              </button>
              {confirmRemove === ball ? (
                <>
                  <button style={{ ...S.btn("warn"), padding: "4px 10px", fontSize: "11px", width: "auto" }}
                    onClick={() => { removeBall(activeBowler, ball); setConfirmRemove(null); }}>
                    Remove
                  </button>
                  <button style={{ ...S.btn(), padding: "4px 8px", fontSize: "11px" }}
                    onClick={() => setConfirmRemove(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "16px", padding: "0 4px" }}
                  onClick={() => setConfirmRemove(ball)} aria-label={`Remove ${ball}`}>
                  ×
                </button>
              )}
            </div>
            {isOpen && (
              <LayoutEditor
                layout={layout}
                onChange={next => setBallLayout(activeBowler, ball, next)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
