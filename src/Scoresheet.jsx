import { C, S } from "./ui.jsx";
import { frameScoresheet } from "./domain/scoring.js";

// The ten frames, the way a bowler already pictures a game.
//
// Editing a frame used to mean History > Shots > scroll until you find
// it. That's a database view of something every bowler reads as a
// scoresheet: ten boxes left to right, marks in the corners, a running
// total underneath. Tapping the frame you want is how it should work.
//
// Live: it rebuilds from `shots` on every render, so a mark appears the
// moment a shot is saved rather than after leaving and returning.
export default function Scoresheet({
  shots = [],
  currentFrame = null,   // string|number — the frame being logged now
  currentBall = null,    // 1|2|3 within the tenth
  onSelectFrame,         // (frame, shot) => void
}) {
  const rows = frameScoresheet(shots);

  // Nothing bowled and nothing in progress: a row of ten empty boxes is
  // just noise before the first ball.
  const anything = rows.some(r => r.marks.length || r.running != null);
  if (!anything && !currentFrame) return null;

  return (
    <div style={{ ...S.card, padding: "10px 8px", marginBottom: "12px" }}>
      <div style={{ display: "flex", gap: "2px", overflowX: "auto" }}>
        {rows.map(r => {
          const isCurrent = String(r.frame) === String(currentFrame);
          const tenth = r.frame === 10;
          const bowled = r.marks.length > 0;

          return (
            <button
              key={r.frame}
              onClick={() => onSelectFrame?.(r.frame, r.shot)}
              aria-label={`Frame ${r.frame}${bowled ? `, ${r.marks.join(" ")}` : ", not bowled"}${r.running != null ? `, running ${r.running}` : ""}`}
              style={{
                flex: tenth ? "0 0 62px" : "1 1 0",
                minWidth: tenth ? "62px" : "32px",
                padding: 0,
                cursor: "pointer",
                background: isCurrent ? C.accent + "1a" : "transparent",
                border: `1px solid ${isCurrent ? C.accent : C.border}`,
                borderRadius: "6px",
                color: C.text,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Frame number, small — it's an index, not the content. */}
              <div style={{ fontSize: "8px", color: C.textMuted, lineHeight: 1, paddingTop: "3px" }}>
                {r.frame}
              </div>

              {/* Marks. The tenth gets three boxes; every other frame two. */}
              <div style={{ display: "flex", justifyContent: "center", gap: "1px", minHeight: "16px", alignItems: "center" }}>
                {Array.from({ length: tenth ? 3 : 2 }).map((_, i) => (
                  <span key={i} style={{
                    width: tenth ? "16px" : "14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    lineHeight: "16px",
                    color: r.marks[i] === "X" || r.marks[i] === "/" ? C.strike : C.text,
                  }}>
                    {r.marks[i] || ""}
                  </span>
                ))}
              </div>

              {/* Running total. Blank when it genuinely isn't known yet --
                  frame 7 can't be scored until 8 and 9 are bowled, and a
                  provisional number there would be a lie. */}
              <div style={{
                fontSize: "11px",
                fontWeight: 700,
                lineHeight: "18px",
                minHeight: "18px",
                color: r.running != null ? C.text : C.textMuted,
                borderTop: `1px solid ${C.border}`,
              }}>
                {r.running != null ? r.running : ""}
              </div>
            </button>
          );
        })}
      </div>

      {currentFrame && (
        <div style={{ fontSize: "10px", color: C.textMuted, marginTop: "6px", textAlign: "center" }}>
          Tap any frame to edit it
          {currentBall && Number(currentFrame) === 10 ? ` · ball ${currentBall}` : ""}
        </div>
      )}
    </div>
  );
}
