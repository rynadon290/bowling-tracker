import { useState } from "react";
import { C, S, Chip } from "./ui.jsx";
import {
  ENVIRONMENTS, TRACKING_MODES, TRACKING_MODE_LABELS, TRACKING_MODE_DESCRIPTIONS,
  applyEnvironment, setTrackingMode,
} from "./domain/preferences.js";
import { APP_NAME } from "./constants.js";
import { resolveHomeCenters } from "./domain/profiles.js";

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
// Name, handedness and style ARE asked here, having originally been left
// out on the grounds that they're recoverable later. That reasoning held
// until those fields turned out to be load-bearing:
//
//   - handedness decides corner-pin labelling, strike descriptors and
//     drill mirroring, so an unasked default is silently wrong for every
//     left-handed bowler until they find Profile;
//   - the name is what team invites and scorecard name-matching resolve
//     against, so an empty one makes both fail in ways that look like
//     bugs rather than missing setup.
//
// The wizard-length objection is still right, so this stays one short
// screen with everything defaulted: a right-handed, one-handed bowler
// types a name and moves on. Home centers are optional and skippable.
//
// Ball arsenal is still NOT asked -- it genuinely is recoverable later
// and it's the one that turns setup into data entry.
export default function Onboarding({ preferences, onApply, onFinish, profile, onProfileChange, centers = [], searchCenters, ensureCenter }) {
  // Two steps rather than one long scroll: on a phone, four environment
  // chips plus their descriptions plus two tracking chips plus theirs is
  // more than a screenful, and a "Start" button below the fold reads as a
  // dead end.
  const [step, setStep] = useState(1);
  const [centerQuery, setCenterQuery] = useState("");
  const [centerResults, setCenterResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const name = profile?.bowlerName || "";
  // Defaults, not blanks: most bowlers are right-handed and one-handed,
  // so the common case is zero taps. A blank handedness question would
  // make everyone answer to save a minority from being wrong.
  const leftHanded = !!profile?.leftHanded;
  const twoHanded = !!profile?.twoHanded;
  // homeCenters stores center IDs, not objects -- normalizeProfile drops
  // anything else, so storing the object here meant the selection
  // silently vanished on save. Resolved back to names for display.
  const homeCenterIds = profile?.homeCenters || [];
  const homeCenters = resolveHomeCenters(profile, centers);

  function setField(field, value) {
    onProfileChange?.({ ...profile, [field]: value });
  }

  async function runCenterSearch(q) {
    setCenterQuery(q);
    if (!q.trim() || !searchCenters) { setCenterResults([]); return; }
    setSearching(true);
    try { setCenterResults((await searchCenters(q)) || []); }
    catch { setCenterResults([]); }
    setSearching(false);
  }

  return (
    <div style={{ ...S.app, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 16px", maxWidth: "480px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "6px" }}>
            Welcome to
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: C.accent, letterSpacing: "0.04em" }}>
            🎳 {APP_NAME}
          </div>
        </div>

        {/* Step indicator. Two dots is enough to signal "this is short" -- a
            progress bar would overstate how long this takes. */}
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "20px" }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              width: step === n ? "20px" : "6px", height: "6px", borderRadius: "3px",
              backgroundColor: step === n ? C.accent : C.border, transition: "width 0.2s",
            }} />
          ))}
        </div>

        {step === 1 && (
          <>
            <div style={{ fontSize: "19px", fontWeight: 600, color: C.text, marginBottom: "6px" }}>
              Who's bowling?
            </div>
            <div style={{ fontSize: "13px", color: C.textMuted, marginBottom: "18px" }}>
              Your name goes on your scores and is how teammates find you. The rest sets up the stats correctly — all changeable later.
            </div>

            <input style={{ ...S.input, marginBottom: "16px" }}
              placeholder="Your name" value={name} autoFocus
              onChange={e => setField("bowlerName", e.target.value)} />

            <div style={{ ...S.label, marginBottom: "6px" }}>Which hand?</div>
            <div style={{ ...S.chips, marginBottom: "14px" }}>
              <Chip label="Right" selected={!leftHanded} onToggle={() => setField("leftHanded", false)} />
              <Chip label="Left" selected={leftHanded} onToggle={() => setField("leftHanded", true)} />
            </div>

            <div style={{ ...S.label, marginBottom: "6px" }}>Style</div>
            <div style={{ ...S.chips, marginBottom: "14px" }}>
              <Chip label="One-handed" selected={!twoHanded} onToggle={() => setField("twoHanded", false)} />
              <Chip label="Two-handed" selected={twoHanded} onToggle={() => setField("twoHanded", true)} />
            </div>

            <div style={{ ...S.label, marginBottom: "6px" }}>
              Where do you bowl? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
            </div>
            {homeCenterIds.length > 0 && (
              <div style={{ ...S.chips, marginBottom: "8px" }}>
                {homeCenterIds.map(id => {
                  const known = homeCenters.find(c => c.id === id);
                  return (
                    <Chip key={id} label={known?.name || id} selected
                      onToggle={() => setField("homeCenters", homeCenterIds.filter(x => x !== id))} />
                  );
                })}
              </div>
            )}
            <input style={{ ...S.input, marginBottom: "8px" }}
              placeholder="Search for a center" value={centerQuery}
              onChange={e => runCenterSearch(e.target.value)} />
            {searching && <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px" }}>Searching…</div>}
            {centerResults.slice(0, 4).map(r => (
              <button key={r.id || r.name}
                style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", padding: "8px 10px",
                  marginBottom: "6px", borderRadius: "8px", backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                onClick={async () => {
                  // ensureCenter registers the center and returns its id,
                  // which is what the profile actually stores.
                  const id = ensureCenter ? await ensureCenter(r) : (r.id || r.name);
                  if (id && !homeCenterIds.includes(id)) {
                    setField("homeCenters", [...homeCenterIds, id]);
                  }
                  setCenterQuery(""); setCenterResults([]);
                }}>
                <div style={{ fontSize: "13px", color: C.text }}>{r.name}</div>
                {r.address && <div style={{ fontSize: "11px", color: C.textMuted }}>{r.address}</div>}
              </button>
            ))}

            <button style={{ ...S.btn("primary"), marginTop: "18px" }}
              disabled={!name.trim()}
              onClick={() => setStep(2)}>
              Continue
            </button>
            {/* A name is the one thing that can't sensibly be defaulted --
                everything else here has a working default, so this is the
                only field that blocks. */}
            {!name.trim() && (
              <div style={{ fontSize: "11px", color: C.textMuted, textAlign: "center", marginTop: "8px" }}>
                Just a first name is fine.
              </div>
            )}
          </>
        )}

        {step === 2 && (
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
            <button style={S.btn("primary")} onClick={() => setStep(3)}>Next</button>
          </>
        )}

        {step === 3 && (
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
              onClick={() => setStep(2)}>
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
