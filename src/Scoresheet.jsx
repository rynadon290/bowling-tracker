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
  bowlerName = "",       // whose card this is
  maxScore = null,       // ceiling if they strike out from here
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

      {/* Whose card this is, and what the game can still reach.
      
          The name matters when logging for a teammate: the frames look
          identical whoever they belong to, and entering someone else's
          shots under your own name is the most common first-session
          mistake. The max is a fact about the game, so it belongs here
          rather than above the result buttons. */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginTop: "6px", fontSize: "10px", color: C.textMuted,
      }}>
        <span style={{ fontWeight: 600, color: bowlerName ? C.text : C.textMuted }}>
          {bowlerName || ""}
        </span>
        <span>
          {currentFrame ? "Tap any frame to edit" : ""}
          {currentBall && Number(currentFrame) === 10 ? ` · ball ${currentBall}` : ""}
        </span>
        <span style={{ color: C.accent, fontWeight: 600 }}>
          {maxScore != null ? `${maxScore} max` : ""}
        </span>
      </div>
    </div>
  );
}
