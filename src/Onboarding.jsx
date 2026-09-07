import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  ENVIRONMENTS, TRACKING_MODES, TRACKING_MODE_LABELS, TRACKING_MODE_DESCRIPTIONS,
  applyEnvironment, setTrackingMode,
} from "./domain/preferences.js";
import { APP_NAME } from "./constants.js";

const ENVIRONMENT_LABELS = { practice: "Practice", league: "League", tournament: "Tournament", casual: "Just Bowling" };
const ENVIRONMENT_DESCRIPTIONS = {
  practice: "Working on your game. Every detail field on by default.",
  league: "Your regular night. Fast logging, money games ready.",
  tournament: "Squad play. Variable games, lane pairs, and cut lines.",
  casual: "With friends or the kids. Just the scores, nothing else.",
};

// The full-screen first launch.
//
// This is a gate, not a card: it owns the whole viewport and the main app
// (nav, profile, settings) doesn't render behind it. The reasoning is that
// these two answers reshape the entire Log tab -- which fields appear, how
// much is asked per shot -- so landing on a Log screen configured for the
// wrong thing and then hunting for the setting is a worse first minute
// than two taps up front.
//
// Shown once, ever. After this the quieter in-app prompt
// (domain/launchPrompt.js) handles day-to-day changes, and everything here
// stays editable in Settings.
//
// Deliberately NOT asked here: name, handedness, home center, ball
// arsenal. Those are all recoverable later and none of them change what
// the first screen looks like. A long setup wizard before someone has seen
// the app is how you lose them.
export default function Onboarding({ preferences, onApply, onFinish }) {
  // Two steps rather than one long scroll: on a phone, four environment
  // chips plus their descriptions plus two tracking chips plus theirs is
  // more than a screenful, and a "Start" button below the fold reads as a
  // dead end.
  const [step, setStep] = useState(1);

  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 16px", maxWidth: "480px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "13px", color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
            Welcome to
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: C.accent, letterSpacing: "0.04em" }}>
            🎳 {APP_NAME}
          </div>
        </div>

        {/* Step indicator. Two dots is enough to signal "this is short" -- a
            progress bar would overstate how long this takes. */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "20px" }}>
          {[1, 2].map(n => (
            <div key={n} style={{
              width: step === n ? "20px" : "6px", height: "6px", borderRadius: "3px",
              backgroundColor: step === n ? C.accent : C.border, transition: "width 0.2s",
            }} />
          ))}
        </div>

        {step === 1 && (
          <>
            <div style={{ fontSize: "19px", fontWeight: 600, color: C.text, marginBottom: "6px" }}>
              What are you bowling?
            </div>
            <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "18px" }}>
              This sets sensible defaults. You can change it any time — and it won't keep asking on your regular bowling nights.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {ENVIRONMENTS.map(env => {
                const selected = preferences.environment === env;
                return (
                  <button key={env}
                    onClick={() => onApply(prev => applyEnvironment(prev, env))}
                    style={{
                      textAlign: "left", padding: "12px 14px", borderRadius: "10px", cursor: "pointer",
                      border: `1px solid ${selected ? C.accent : C.border}`,
                      backgroundColor: selected ? C.accentDim : C.card,
                      WebkitTapHighlightColor: "transparent",
                    }}>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: selected ? C.accent : C.text, marginBottom: "2px" }}>
                      {ENVIRONMENT_LABELS[env]}
                    </div>
                    <div style={{ fontSize: "12px", color: C.textMuted }}>
                      {ENVIRONMENT_DESCRIPTIONS[env]}
                    </div>
                  </button>
                );
              })}
            </div>
            <button style={S.btn("primary")} onClick={() => setStep(2)}>Next</button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: "19px", fontWeight: 600, color: C.text, marginBottom: "6px" }}>
              How much do you want to track?
            </div>
            <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "18px" }}>
              Shot-by-shot unlocks the detailed stats. Game scores only is faster and you can switch whenever you like.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {TRACKING_MODES.map(mode => {
                const selected = preferences.trackingMode === mode;
                return (
                  <button key={mode}
                    onClick={() => onApply(prev => setTrackingMode(prev, mode))}
                    style={{
                      textAlign: "left", padding: "12px 14px", borderRadius: "10px", cursor: "pointer",
                      border: `1px solid ${selected ? C.accent : C.border}`,
                      backgroundColor: selected ? C.accentDim : C.card,
                      WebkitTapHighlightColor: "transparent",
                    }}>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: selected ? C.accent : C.text, marginBottom: "2px" }}>
                      {TRACKING_MODE_LABELS[mode]}
                    </div>
                    <div style={{ fontSize: "12px", color: C.textMuted }}>
                      {TRACKING_MODE_DESCRIPTIONS[mode]}
                    </div>
                  </button>
                );
              })}
            </div>
            <button style={S.btn("primary")} onClick={onFinish}>Start Bowling</button>
            <button
              style={{ ...S.btn(), width: "100%", marginTop: "8px" }}
              onClick={() => setStep(1)}>
              Back
            </button>
          </>
        )}

        {/* An escape hatch on both steps. Someone who just wants to see the
            app shouldn't be trapped behind a setup screen -- the defaults
            are reasonable and everything here lives in Settings too. */}
        <button
          style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "12px", marginTop: "16px", padding: "8px" }}
          onClick={onFinish}>
          Skip — use defaults
        </button>
      </div>
    </div>
  );
}
