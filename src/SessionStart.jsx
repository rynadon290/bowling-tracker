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
// Everything here is also in Settings -- this is a shortcut, not the only
// way to set it, and it can be dismissed without choosing.
export default function SessionStart({ preferences, onApply, onDismiss }) {
  return (
    <div style={{ ...S.card, border: `1px solid ${C.accent}44`, marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div style={{ ...S.label, color: C.accent, marginBottom: 0 }}>Bowling today?</div>
        <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "12px", padding: "2px 4px" }}
          onClick={onDismiss}>
          Skip
        </button>
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "12px" }}>
        Sets up the app for tonight. You can change any of it later in Settings.
      </div>

      <div style={S.label}>Where</div>
      <div style={S.chips}>
        {ENVIRONMENTS.map(env => (
          <Chip key={env} label={ENVIRONMENT_LABELS[env]}
            selected={preferences.environment === env}
            onToggle={() => onApply(prev => applyEnvironment(prev, env))} />
        ))}
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px", marginBottom: "12px" }}>
        {ENVIRONMENT_DESCRIPTIONS[preferences.environment]}
      </div>

      <div style={S.label}>How much detail</div>
      <div style={S.chips}>
        {TRACKING_MODES.map(mode => (
          <Chip key={mode} label={TRACKING_MODE_LABELS[mode]}
            selected={preferences.trackingMode === mode}
            onToggle={() => onApply(prev => setTrackingMode(prev, mode))} />
        ))}
      </div>
      <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "4px", marginBottom: "12px" }}>
        {TRACKING_MODE_DESCRIPTIONS[preferences.trackingMode]}
      </div>

      <button style={S.btn("primary")} onClick={onDismiss}>
        Start Bowling
      </button>
    </div>
  );
}
