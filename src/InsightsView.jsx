import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  canAnalyze, gamesUntilAnalysis, buildAnalysisPayload, payloadIsEmpty,
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
        <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "10px" }}>
          Not enough data yet on {ballsWaiting.length === 1 ? "this ball" : "these balls"}:{" "}
          {ballsWaiting.map(w => `${w.key.replace("ball:", "")} (${w.shortBy} more shots)`).join(", ")}.
          Comparing balls needs a bigger sample than overall stats, because the
          uncertainty in each one adds up.
        </div>
      )}
    </div>
  );
}

export default function InsightsView({ stats, onAnalyze, bowlerName }) {
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
    return (
      <div style={S.card}>
        <div style={S.label}>Insights</div>
        <div style={{ fontSize: "12px", color: C.textMuted }}>
          You have {gameCount} games logged, but no single statistic has enough
          behind it yet to analyse honestly. Keep logging — this fills in as
          each one reaches a usable sample.
        </div>
      </div>
    );
  }

  return (
    <div>
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
