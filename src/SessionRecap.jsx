import { C, S } from "./ui.jsx";
import {
  casualRecap, practiceRecap, practiceComparison, describePractice,
  drillRecap, drillComparison, describeDrills,
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

// Drill work has no game scores, so it gets its own summary: made/missed
// per target, and a comparison that only ever pits two people against each
// other on a target they BOTH worked.
function DrillRecap({ recap, comparison }) {
  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44` }}>
      <div style={{ ...S.label, color: C.accent }}>Drill Recap</div>
      <div style={{ fontSize: "12px", color: C.text, marginBottom: "10px" }}>
        {describeDrills(recap)}
      </div>

      {recap.lines.map(l => (
        <div key={l.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12px", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.text }}>{l.label}</span>
          <span style={{ color: C.textMuted }}>
            {l.made}/{l.attempts}{" "}
            {/* A percentage off a couple of attempts misleads more than it
                informs, so it's withheld rather than shown small. */}
            {l.thin
              ? <span style={{ color: C.spare }}>(too few to rate)</span>
              : <strong style={{ color: C.accent }}>{l.rate}%</strong>}
          </span>
        </div>
      ))}

      {comparison && comparison.shared.length > 0 && (
        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ ...S.label, marginBottom: "6px" }}>Head To Head</div>
          {comparison.shared.map(sh => (
            <div key={sh.key} style={{ marginBottom: "8px" }}>
              {/* A shared drill can read differently on each side: a
                  lefty and a righty working the same abstract target
                  ("the near-corner bucket-ish shape") have mirror-image
                  real pins, so each line states its OWN label rather
                  than assuming both sides mean the same physical pins. */}
              <div style={{ fontSize: "12px", color: C.text, marginBottom: "2px" }}>{sh.myLabel}</div>
              <div style={{ fontSize: "11px", color: C.textMuted, display: "flex", justifyContent: "space-between" }}>
                <span>You — {sh.mine.made}/{sh.mine.attempts}{sh.mine.thin ? "" : ` (${sh.mine.rate}%)`}</span>
              </div>
              {sh.others.map(o => (
                <div key={o.bowler} style={{ fontSize: "11px", color: C.textMuted, display: "flex", justifyContent: "space-between" }}>
                  <span>{o.bowler} — {o.label !== sh.myLabel ? `${o.label}, ` : ""}{o.attempts} attempts{o.thin ? "" : ` (${o.rate}%)`}</span>
                  {o.diff != null && (
                    <span style={{ color: o.diff > 0 ? C.strike : o.diff < 0 ? C.miss : C.textMuted, fontWeight: 600 }}>
                      {o.diff > 0 ? "+" : o.diff < 0 ? "\u2212" : "\u00b1"}{Math.abs(o.diff)}
                    </span>
                  )}
                </div>
              ))}
              {sh.others.some(o => o.diff == null) && (
                <div style={{ fontSize: "10px", color: C.spare, marginTop: "2px" }}>
                  Not enough attempts on one side to call a difference.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {comparison && comparison.theirsOnly.length > 0 && (
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "10px", color: C.textMuted, marginBottom: "4px" }}>
            They also worked (nothing of yours to compare against):
          </div>
          {comparison.theirsOnly.map((t, i) => (
            <div key={`${t.bowler}-${t.label}-${i}`} style={{ fontSize: "11px", color: C.textMuted }}>
              {t.bowler} — {t.label}, {t.attempts} attempts{t.thin ? "" : ` (${t.rate}%)`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionRecap({
  environment, manualScores, bowler, allBowlers, league, date, priorAverage,
  drills, leftHandedForBowler,
}) {
  // A drill comparison can involve two people of different hands, so
  // there's no single flag for "the" handedness here -- each side needs
  // its own. Falls back to right-handed when the caller doesn't supply a
  // resolver, matching every other handedness-aware default in this app.
  const handOf = leftHandedForBowler || (() => false);
  if (environment === "casual") {
    const recap = casualRecap(manualScores, allBowlers, league, date);
    if (!recap) return null;
    return <CasualRecap recap={recap} />;
  }

  if (environment === "practice") {
    const partners = (allBowlers || []).filter(b => b !== bowler);
    const recap = practiceRecap(manualScores, bowler, league, date, priorAverage);
    const comparison = practiceComparison(manualScores, bowler, partners, league, date);
    // Drills and games are separate kinds of practice and a session can
    // contain both, so neither replaces the other.
    const dRecap = drillRecap(drills, bowler, date, handOf(bowler));
    const dComparison = drillComparison(drills, bowler, partners, date, handOf);
    if (!recap && !dRecap) return null;
    return (
      <>
        {recap && <PracticeRecap recap={recap} comparison={comparison} />}
        {dRecap && <DrillRecap recap={dRecap} comparison={dComparison} />}
      </>
    );
  }

  return null;
}
