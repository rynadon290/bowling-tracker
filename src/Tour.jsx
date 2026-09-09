import { useState } from "react";
import { C, S } from "./ui.jsx";
import { tourSteps, stepAt, isLastStep, tourLength } from "./domain/tour.js";

// A short walkthrough after setup.
//
// Setup asks the two things the app can't work without. It can't explain
// what five tabs are for, so a new bowler landed on a full app and had
// to find out by poking at it.
//
// Deliberately a card at the bottom rather than a spotlight over each
// element: highlighting a nav item means measuring its position, which
// breaks on every layout change and on any screen where the element
// isn't visible yet. A card that names the tab and switches to it is
// simpler and doesn't lie when the layout moves.
export default function Tour({ preferences = {}, onNavigate, onFinish }) {
  const [index, setIndex] = useState(0);
  const steps = tourSteps(preferences);
  const step = stepAt(preferences, index);
  const total = tourLength(preferences);

  if (!step) return null;

  const last = isLastStep(preferences, index);

  function go(next) {
    const clamped = Math.max(0, Math.min(total - 1, next));
    setIndex(clamped);
    const s = steps[clamped];
    // Switch to the tab being described, so the bowler is looking at the
    // thing while reading about it.
    if (s?.tab && onNavigate) onNavigate(s.tab);
  }

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 300,
      padding: "12px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
      background: C.bg, borderTop: `1px solid ${C.border}`,
      boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: C.text }}>{step.title}</div>
        <div style={{ fontSize: "11px", color: C.textMuted }}>{index + 1} of {total}</div>
      </div>

      <div style={{ fontSize: "13px", color: C.textMuted, lineHeight: 1.5, marginBottom: "12px" }}>
        {step.body}
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {/* Skip is always available and always visible. A tour someone
            can't leave is worse than no tour. */}
        <button style={{ ...S.btn(), padding: "10px 14px", fontSize: "13px" }} onClick={onFinish}>
          Skip
        </button>
        {index > 0 && (
          <button style={{ ...S.btn(), padding: "10px 14px", fontSize: "13px" }} onClick={() => go(index - 1)}>
            Back
          </button>
        )}
        <button style={{ ...S.btn("primary"), flex: 1, padding: "10px 14px", fontSize: "13px" }}
          onClick={() => (last ? onFinish?.() : go(index + 1))}>
          {last ? "Start bowling" : "Next"}
        </button>
      </div>
    </div>
  );
}
