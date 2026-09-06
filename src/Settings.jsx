import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import { useAuth } from "./AuthProvider.jsx";
import {
  ENVIRONMENTS, TRACKED_FIELD_KEYS, applyEnvironment,
  resetToEnvironmentDefaults, setTrackedField, setShowMoneyGames,
} from "./domain/preferences.js";

const ENVIRONMENT_LABELS = { practice: "Practice", league: "League", tournament: "Tournament" };
const ENVIRONMENT_DESCRIPTIONS = {
  practice: "More detail, no scoring pressure. Every accessory field is on by default.",
  league: "Fast, simple logging. Accessory fields off, money games front and center.",
  tournament: "Same simple logging as League, but money-game tracking is hidden.",
};
const FIELD_LABELS = { surface: "Ball Surface", line: "Line (Board & Arrows)", release: "Release", miss: "Miss Direction" };

export default function Settings() {
  const { preferences, updatePreferences } = useAuth();
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState(null);

  async function apply(next) {
    setError(null);
    const result = await updatePreferences(next);
    if (result.error) { setError(result.error.message); return; }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>Environment</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Sets sensible defaults for the toggles below — you can still adjust any of them afterward.
        </div>
        <div style={S.chips}>
          {ENVIRONMENTS.map(env => (
            <Chip key={env} label={ENVIRONMENT_LABELS[env]} selected={preferences.environment === env}
              onToggle={() => apply(prev => applyEnvironment(prev, env))} />
          ))}
        </div>
        {preferences.environment && (
          <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "8px" }}>
            {ENVIRONMENT_DESCRIPTIONS[preferences.environment]}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.label}>Accessory Fields</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Extra detail per shot. Off by default outside Practice — turn on whichever you actually want to track.
        </div>
        <div style={S.chips}>
          {TRACKED_FIELD_KEYS.map(key => (
            <Chip key={key} label={FIELD_LABELS[key]} selected={!!preferences.trackedFields[key]}
              onToggle={() => apply(prev => setTrackedField(prev, key, !prev.trackedFields[key]))}
              color={C.spare} />
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Money Games</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Poker, 3-6-9, and High Game Pot tracking cards on the Log and Stats tabs.
        </div>
        <div style={S.chips}>
          <Chip label="Shown" selected={preferences.showMoneyGames} onToggle={() => apply(prev => setShowMoneyGames(prev, true))} color={C.strike} />
          <Chip label="Hidden" selected={!preferences.showMoneyGames} onToggle={() => apply(prev => setShowMoneyGames(prev, false))} color={C.miss} />
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Reset</div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px" }}>
          Made a mess of your own toggles? Restore {ENVIRONMENT_LABELS[preferences.environment] || "this environment"}'s defaults without picking through everything by hand.
        </div>
        <button style={{ ...S.btn(), width: "100%" }} onClick={() => apply(prev => resetToEnvironmentDefaults(prev))}>
          Reset to {ENVIRONMENT_LABELS[preferences.environment] || "Default"} Defaults
        </button>
      </div>

      {savedFlash && <div style={{ fontSize: "13px", color: C.strike, textAlign: "center", marginBottom: "12px" }}>✓ Saved</div>}
      {error && <div style={{ fontSize: "13px", color: C.miss, textAlign: "center", marginBottom: "12px" }}>{error}</div>}
    </div>
  );
}
