import { C, S } from "./ui.jsx";
import {
  casualRecap, practiceRecap, practiceComparison, describePractice,
} from "./domain/sessionRecap.js";

function ScoreRow({ line, rank, highlight }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      padding: "8px 10px", marginBottom: "6px", borderRadius: "8px",
      backgroundColor: highlight ? C.accentDim : C.surface,
      border: `1px solid ${highlight ? C.accent + "44" : C.border}`,
    }}>
      {rank != null && (
        <div style={{ fontSize: "13px", fontWeight: 700, color: rank === 1 ? C.spare : C.textMuted, width: "18px", flexShrink: 0 }}>
          {rank}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {line.bowler}
        </div>
        <div style={{ fontSize: "11px", color: C.textMuted }}>
          {line.scores.join(" · ")}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "16px", fontWeight: 700, color: C.accent }}>{line.total}</div>
        <div style={{ fontSize: "10px", color: C.textMuted }}>{line.average} avg</div>
      </div>
    </div>
  );
}

// "Just Bowling" recap. This is the one people read out loud, so it leads
// with who won and hands out awards rather than opening with statistics.
function CasualRecap({ recap }) {
  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
      <div style={{ ...S.label, color: C.accent }}>How It Went 🎳</div>

      {recap.lines.map((line, i) => (
        <ScoreRow key={line.bowler} line={line} rank={recap.bowlerCount > 1 ? i + 1 : null} highlight={i === 0 && recap.bowlerCount > 1} />
      ))}

      {recap.awards.length > 0 && (
        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
          {recap.awards.map(a => (
            <div key={a.id} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ fontSize: "16px", flexShrink: 0, lineHeight: 1.2 }}>{a.emoji}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>
                  {a.title}: {a.bowler}
                </div>
                <div style={{ fontSize: "11px", color: C.textMuted }}>{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: "11px", color: C.textMuted, textAlign: "center", marginTop: "6px" }}>
        {recap.totalPins} pins between {recap.bowlerCount} bowler{recap.bowlerCount === 1 ? "" : "s"}
        {recap.margin != null && recap.margin > 0 && <> · {recap.margin} pins first to last</>}
      </div>
    </div>
  );
}

// Practice recap. Compares tonight against this bowler's own history --
// that's what practice is for -- and only adds a partner comparison when
// somebody actually came along.
function PracticeRecap({ recap, comparison }) {
  const vs = recap.vsAverage;
  const vsColor = vs == null ? C.textMuted : vs > 0 ? C.strike : vs < 0 ? C.miss : C.textMuted;

  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
      <div style={{ ...S.label, color: C.accent }}>Practice Recap</div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
        <div style={S.statBox}>
          <div style={{ ...S.statNum, fontSize: "18px" }}>{recap.average}</div>
          <div style={S.statLbl}>Average</div>
        </div>
        <div style={S.statBox}>
          <div style={{ ...S.statNum, fontSize: "18px", color: C.strike }}>{recap.high}</div>
          <div style={S.statLbl}>Best</div>
        </div>
        <div style={S.statBox}>
          <div style={{ ...S.statNum, fontSize: "18px", color: C.textMuted }}>{recap.spread}</div>
          <div style={S.statLbl}>Spread</div>
        </div>
        {vs != null && (
          <div style={{ ...S.statBox, border: `1px solid ${vsColor}44` }}>
            <div style={{ ...S.statNum, fontSize: "18px", color: vsColor }}>
              {vs > 0 ? "+" : vs < 0 ? "\u2212" : ""}{Math.abs(vs)}
            </div>
            <div style={S.statLbl}>vs Avg</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: "12px", color: C.text, marginBottom: comparison ? "10px" : 0 }}>
        {describePractice(recap)}
      </div>

      {comparison && (
        <div style={{ paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ ...S.label, marginBottom: "6px" }}>Bowling With</div>
          {comparison.comparisons.map(c => (
            <div key={c.bowler} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ color: C.text }}>{c.bowler}</span>
              <span style={{ color: C.textMuted }}>
                {c.theirAverage} avg{" "}
                <span style={{ color: c.diff > 0 ? C.strike : c.diff < 0 ? C.miss : C.textMuted, fontWeight: 600 }}>
                  ({c.diff > 0 ? "+" : c.diff < 0 ? "\u2212" : "±"}{Math.abs(c.diff)})
                </span>
              </span>
            </div>
          ))}
          {/* Compared on average, not total -- flagged when the game counts
              differ so the number isn't read as a straight head-to-head. */}
          {comparison.comparisons.some(c => !c.sameGameCount) && (
            <div style={{ fontSize: "10px", color: C.textMuted, marginTop: "6px" }}>
              Compared on average — you didn't all bowl the same number of games.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionRecap({
  environment, manualScores, bowler, allBowlers, league, date, priorAverage,
}) {
  if (environment === "casual") {
    const recap = casualRecap(manualScores, allBowlers, league, date);
    if (!recap) return null;
    return <CasualRecap recap={recap} />;
  }

  if (environment === "practice") {
    const recap = practiceRecap(manualScores, bowler, league, date, priorAverage);
    if (!recap) return null;
    const partners = (allBowlers || []).filter(b => b !== bowler);
    const comparison = practiceComparison(manualScores, bowler, partners, league, date);
    return <PracticeRecap recap={recap} comparison={comparison} />;
  }

  return null;
}
