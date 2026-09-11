import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  ENVIRONMENTS, ENVIRONMENT_LABELS, ENVIRONMENT_DESCRIPTIONS,
  TRACKING_MODES, TRACKING_MODE_LABELS, TRACKING_MODE_DESCRIPTIONS,
  applyEnvironment, setTrackingMode,
} from "./domain/preferences.js";


// Asked once per day rather than once ever: what you're bowling changes
// night to night, and someone who bowls league Tuesday and a tournament
// Saturday shouldn't have to remember to go change a setting first.
//
// GUIDED, not a form. One question at a time:
//   1. Where are you bowling?
//   2. How much detail? -- skipped entirely for Just Bowling, which is
//      scores-only by definition, so asking would be a question with one
//      possible answer.
// Until both are answered the rest of the Bowl tab stays hidden, so a
// bowler sees one question instead of eleven cards.
//
// There is no Skip. Every card below depends on knowing the environment,
// and skipping left people on a screen configured for whatever they last
// bowled -- which is how a tournament ends up logged into Tuesday league.
// Choosing takes one tap.
export default function SessionStart({ preferences, onApply, onDismiss, envChosen, onEnvChosen, collapsed = false, routineNote = "" }) {
  const [open, setOpen] = useState(!collapsed);

  // Casual needs no tracking question -- it's scores-only by definition.
  const needsTracking = envChosen && preferences.environment !== "casual";

  // Answered state: a one-line summary that reopens on tap. Keeps the
  // answers changeable without a trip to Settings, and without the card
  // taking a screenful once it's served its purpose.
  if (collapsed && !open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ ...S.card, width: "100%", textAlign: "left", cursor: "pointer", border: "none",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}
        aria-label="Change tonight's setup">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>
            {ENVIRONMENT_LABELS[preferences.environment]}
            {preferences.environment !== "casual" && (
              <span style={{ color: C.textMuted, fontWeight: 400 }}>
                {" · "}{TRACKING_MODE_LABELS[preferences.trackingMode]}
              </span>
            )}
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>
            {/* Says WHY it's set this way when the app picked it from a
                routine. "The app decided for me" is only reassuring if
                you can see what it decided and why. */}
            {routineNote || "Tonight's setup"}
          </div>
        </div>
        <span style={{ color: C.accent, fontSize: "12px", flexShrink: 0 }}>Change</span>
      </button>
    );
  }

  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44`, marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div style={{ ...S.label, color: C.accent, marginBottom: 0 }}>Bowling today?</div>
        {/* There has to be a way out, in BOTH states.

            This was fixed once for the collapsed summary -- tapping
            Change and re-picking the SAME environment left the card open
            forever -- and the identical hole was left in the launch
            prompt, where `collapsed` is false and this button did not
            render at all.

            On launch the only exits were picking casual, or tapping a
            tracking chip. Pick a tournament when the tracking mode
            already shows what you want and there is nothing left to tap:
            LogView hides everything below this card while the prompt is
            up, so the Bowl tab shows the card and a Save button and
            nothing else. Re-tapping the already-selected tracking chip
            released it, which is why it looked like a tracking-mode bug.

            The subtitle has said "tap Done" the whole time. Now it
            exists. */}
        {(collapsed || envChosen) && (
          <button onClick={() => { if (collapsed) setOpen(false); else onDismiss(); }}
            style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "12px", padding: "2px 4px" }}>
            Done
          </button>
        )}
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "14px" }}>
        {envChosen
          ? "Change either answer, then tap Done."
          : "Two quick questions and the app sets itself up for tonight."}
      </div>

      <div style={S.label}>Mode</div>
      <div style={S.chips}>
        {ENVIRONMENTS.map(env => (
          <Chip key={env} label={ENVIRONMENT_LABELS[env]}
            selected={envChosen && preferences.environment === env}
            onToggle={() => {
              onApply(prev => applyEnvironment(prev, env));
              onEnvChosen();
              // Just Bowling has no second question, so choosing it
              // finishes the flow outright.
              if (env === "casual") { if (collapsed) setOpen(false); else onDismiss(); }
            }} />
        ))}
      </div>
      {envChosen && (
        <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px", marginBottom: "12px" }}>
          {ENVIRONMENT_DESCRIPTIONS[preferences.environment]}
        </div>
      )}

      {/* Only after the first question is answered. */}
      {needsTracking && (
        <>
          <div style={{ ...S.label, marginTop: "6px" }}>How much detail?</div>
          <div style={S.chips}>
            {TRACKING_MODES.map(mode => (
              <Chip key={mode} label={TRACKING_MODE_LABELS[mode]}
                selected={preferences.trackingMode === mode}
                onToggle={() => {
                  onApply(prev => setTrackingMode(prev, mode));
                  // Both questions answered -- collapse and get out of the
                  // way rather than making them tap a third time.
                  if (collapsed) setOpen(false); else onDismiss();
                }} />
            ))}
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px" }}>
            {TRACKING_MODE_DESCRIPTIONS[preferences.trackingMode]}
          </div>
        </>
      )}
    </div>
  );
}
