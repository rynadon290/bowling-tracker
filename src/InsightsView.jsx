import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  canAnalyze, gamesUntilAnalysis, buildAnalysisPayload, payloadIsEmpty,
  upcomingUnlocks,
  MIN_GAMES_FOR_ANALYSIS, SAMPLE_THRESHOLDS,
} from "./domain/insightGating.js";

const CONFIDENCE_COLORS = { clear: C.strike, moderate: C.spare, tentative: C.textMuted };
const CONFIDENCE_LABELS = { clear: "Clear", moderate: "Moderate", tentative: "Tentative" };

// Shows what the analysis was built from, and what wasn't ready yet.
//
// Displaying the withheld list matters: without it, a bowler with eight
// balls sees insights that mention none of them and reasonably concludes
// the feature is broken, rather than that their per-ball samples are still
// too thin to say anything honest about.
function DataBasis({ payload }) {
  const ballsWaiting = (payload.withheld || []).filter(w => w.key.startsWith("ball:"));
  return (
    <div style={{ ...S.card, border: `1px solid ${C.border}` }}>
      <div style={S.label}>What This Is Based On</div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
        {payload.gameCount} games. Only statistics with enough data to be meaningful are analysed.
      </div>
      <div style={S.chips}>
        {Object.keys(payload.included).map(key => (
          <Chip key={key} label={key.replace(/([A-Z])/g, " $1").toLowerCase()} dense selected color={C.strike} />
        ))}
      </div>
      {ballsWaiting.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>
            Ball comparisons unlock as each ball builds up its own sample.
            They need more than overall stats because comparing two
            percentages doubles the uncertainty.
          </div>
          {ballsWaiting.map(w => {
            const name = w.key.replace("ball:", "");
            const pct = Math.min(100, Math.round((w.have / w.need) * 100));
            // ~10 first balls a game, so "shots remaining / 10" is the
            // honest estimate of how many more games it takes.
            const gamesLeft = Math.ceil(w.shortBy / 10);
            return (
              <div key={w.key} style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{name}</span>
                  <span style={{ color: C.textMuted }}>{w.have} of {w.need} · ~{gamesLeft} more {gamesLeft === 1 ? "game" : "games"}</span>
                </div>
                <div style={{ height: "6px", backgroundColor: C.surface, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, backgroundColor: pct >= 75 ? C.strike : pct >= 40 ? C.spare : C.accent, borderRadius: "3px", transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })}
          {ballsWaiting.some(w => (w.have / w.need) >= 0.75) && (
            <div style={{ fontSize: "11px", color: C.strike, marginTop: "6px" }}>
              You're close on {ballsWaiting.filter(w => (w.have / w.need) >= 0.75).map(w => w.key.replace("ball:", "")).join(" and ")} — a couple more nights and it unlocks.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsView({ stats, onAnalyze, bowlerName, newlyAvailable = [], onDismissNew }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const gameCount = stats?.gameCount ?? 0;
  const eligible = canAnalyze(gameCount);
  const payload = eligible ? buildAnalysisPayload(stats) : null;
  const nothingToSay = payload && payloadIsEmpty(payload);

  async function run() {
    setLoading(true);
    setError(null);
    const out = await onAnalyze(payload);
    setLoading(false);
    if (out?.error) { setError(out.error); return; }
    setResult(out);
  }

  if (!bowlerName) {
    return (
      <div style={S.card}>
        <div style={S.label}>Insights</div>
        <div style={{ fontSize: "12px", color: C.textMuted }}>
          Select a bowler on the Log tab first. Insights are about one
          bowler's game, not everyone's combined.
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div style={S.card}>
        <div style={S.label}>Insights</div>
        <div style={{ fontSize: "13px", color: C.text, marginBottom: "8px" }}>
          {gamesUntilAnalysis(gameCount)} more {gamesUntilAnalysis(gameCount) === 1 ? "game" : "games"} to go.
        </div>
        <div style={{ fontSize: "12px", color: C.textMuted }}>
          Insights need at least {MIN_GAMES_FOR_ANALYSIS} games. Below that, the
          numbers swing too much from night to night to say anything you can
          rely on — you'd get confident-sounding patterns that are really just
          noise.
        </div>
      </div>
    );
  }

  if (nothingToSay) {
    // A distance, not a dead end. 26 of 50 league bowlers hit the old
    // version of this screen on their first visit and 9 never returned --
    // not because the bar was wrong, but because "no statistic has enough
    // behind it" reads as never rather than not yet.
    const next = upcomingUnlocks(payload, 3);
    return (
      <div style={S.card}>
        <div style={S.label}>Insights</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: next.length ? "10px" : 0 }}>
          You have {gameCount} games logged. Nothing has enough behind it to
          analyse honestly yet — here's what's closest.
        </div>
        {next.map(u => (
          <div key={u.key} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12px" }}>
              <span style={{ color: C.text }}>{u.label}</span>
              <span style={{ color: C.accent, fontWeight: 600 }}>
                {u.shortBy} more {u.unit}
              </span>
            </div>
            <div style={{ height: "4px", backgroundColor: C.surface, borderRadius: "2px", overflow: "hidden", marginTop: "3px" }}>
              <div style={{ height: "100%", width: `${Math.round(((u.have || 0) / u.need) * 100)}%`, backgroundColor: C.accent, borderRadius: "2px" }} />
            </div>
            <div style={{ fontSize: "10px", color: C.textMuted, marginTop: "2px" }}>
              {u.have} of {u.need}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Announced once, when a threshold is actually crossed -- so a
          bowler who found nothing here last month knows to come back,
          rather than having to keep checking. */}
      {newlyAvailable.length > 0 && (
        <div style={{ ...S.card, border: `1px solid ${C.spare}44`, backgroundColor: C.spare + "11" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
            <div style={{ fontSize: "13px", color: C.text }}>
              <strong>New since last time:</strong> {newlyAvailable.join(", ")}.
            </div>
            {onDismissNew && (
              <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "16px", padding: 0, lineHeight: 1 }}
                onClick={onDismissNew} aria-label="Dismiss">×</button>
            )}
          </div>
        </div>
      )}

      {!result && (
        <div style={S.card}>
          <div style={S.label}>Insights</div>
          <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "12px" }}>
            Looks at your logged statistics and reports what stands out. It only
            uses numbers with enough data behind them, and it reports patterns
            rather than telling you how to bowl.
          </div>
          <button style={S.btn("primary")} onClick={run} disabled={loading}>
            {loading ? "Analysing…" : "Analyse My Game"}
          </button>
        </div>
      )}

      {error && (
        <div style={{ ...S.card, border: `1px solid ${C.miss}44` }}>
          <div style={{ fontSize: "12px", color: C.miss }}>{error}</div>
          <button style={{ ...S.btn(), width: "100%", marginTop: "8px" }} onClick={run}>Try Again</button>
        </div>
      )}

      {result && (
        <>
          {(result.observations || []).map((obs, i) => (
            <div key={i} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.text, flex: 1 }}>{obs.headline}</div>
                <span style={{ fontSize: "9px", color: CONFIDENCE_COLORS[obs.confidence] || C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginLeft: "8px", whiteSpace: "nowrap" }}>
                  {CONFIDENCE_LABELS[obs.confidence] || obs.confidence}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: C.textMuted, lineHeight: 1.5 }}>{obs.detail}</div>
            </div>
          ))}

          {(result.questionsToExplore || []).length > 0 && (
            <div style={S.card}>
              <div style={S.label}>Worth Paying Attention To</div>
              {result.questionsToExplore.map((q, i) => (
                <div key={i} style={{ fontSize: "12px", color: C.textMuted, marginBottom: "6px" }}>• {q}</div>
              ))}
            </div>
          )}

          {payload && <DataBasis payload={payload} />}

          <div style={{ fontSize: "10px", color: C.textMuted, textAlign: "center", marginBottom: "12px" }}>
            Generated from your own logged stats. Patterns in your numbers, not coaching.
          </div>

          <button style={{ ...S.btn(), width: "100%" }} onClick={() => { setResult(null); setError(null); }}>
            Run Again
          </button>
        </>
      )}

      <div style={{ height: "32px" }} />
    </div>
  );
}
