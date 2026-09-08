import { C, S, Chip } from "./ui.jsx";
import {
  ENVIRONMENTS, TRACKING_MODES, TRACKING_MODE_LABELS, TRACKING_MODE_DESCRIPTIONS,
  applyEnvironment, setTrackingMode,
} from "./domain/preferences.js";

const ENVIRONMENT_LABELS = { practice: "Practice", league: "League", tournament: "Tournament", casual: "Just Bowling" };
const ENVIRONMENT_DESCRIPTIONS = {
  practice: "Working on your game. Every detail field on by default.",
  league: "Your regular night. Fast logging, money games ready.",
  tournament: "Squad play. Variable games, lane pairs, and cut lines.",
  casual: "With friends or the kids. Just the scores, nothing else.",
};

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
export default function SessionStart({ preferences, onApply, onDismiss, envChosen, onEnvChosen }) {
  // Casual needs no tracking question -- it's scores-only by definition.
  const needsTracking = envChosen && preferences.environment !== "casual";

  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44`, marginBottom: "12px" }}>
      <div style={{ ...S.label, color: C.accent, marginBottom: "4px" }}>Bowling today?</div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "14px" }}>
        {envChosen
          ? "You can change any of this later in Settings."
          : "Two quick questions and the app sets itself up for tonight."}
      </div>

      <div style={S.label}>Where are you bowling?</div>
      <div style={S.chips}>
        {ENVIRONMENTS.map(env => (
          <Chip key={env} label={ENVIRONMENT_LABELS[env]}
            selected={envChosen && preferences.environment === env}
            onToggle={() => {
              onApply(prev => applyEnvironment(prev, env));
              onEnvChosen();
              // Just Bowling has no second question, so choosing it
              // finishes the flow outright.
              if (env === "casual") onDismiss();
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
                  onDismiss();
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
