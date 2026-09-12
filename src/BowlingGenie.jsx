import { useState } from "react";
import { C, S, AiNote } from "./ui.jsx";
import { reviewAiOutput, overreachNote } from "./domain/aiGuard.js";
import {
  classifyQuestion, refusalMessage, questionsLeftToday, canAskToday,
  budgetLabel, DAILY_QUESTIONS, GENIE_NAME,
} from "./domain/genie.js";

// The bowling genie.
//
// A lamp that floats over every screen. Rub it, ask it three things a
// day about your own bowling, and it answers from your history.
//
// WHY IT IS CAPPED AT THREE.
//
// Not really cost -- a question is well under a cent. Three makes each
// one worth thinking about, which is the difference between a feature
// people use and a chat box they ignore. The scarcity is the design.
//
// A LOCALLY-BLOCKED QUESTION IS FREE.
//
// Nothing was spent and the classifier might simply be wrong about an
// oddly-phrased question. Burning a wish on a regex misfire is exactly
// what someone would remember about this feature.
// Two shades derived from the theme accent.
//
// accentDark / accentLight are not theme tokens -- referencing them fell
// back to flat accent on every path, which flattens the lamp into a
// silhouette and loses the taper and the foot entirely. Mixed here so
// the shading follows whatever accent the bowler's theme uses.
function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function BowlingGenie({
  asked = [], today = "", onAsk, disabled = false,
}) {
  const lampMid = C.accent;
  const lampDark = shade(C.accent, -0.22);
  const lampLight = shade(C.accent, 0.18);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [freeRefusal, setFreeRefusal] = useState("");

  const left = questionsLeftToday(asked, today);
  const canAsk = canAskToday(asked, today) && !disabled;

  async function ask() {
    const q = question.trim();
    if (!q || thinking) return;

    // Checked BEFORE spending anything. A refusal here costs nothing and
    // must not decrement.
    const verdict = classifyQuestion(q);
    if (!verdict.ok) {
      setFreeRefusal(refusalMessage(verdict.reason));
      setAnswer(null);
      return;
    }

    setFreeRefusal("");
    setThinking(true);
    setAnswer(null);
    try {
      const reply = await onAsk?.(q);
      // Checked against what she was actually sent, the same way the
      // analysis is. A genie discussing a statistic the app withholds is
      // the fastest way to lose a bowler's trust in both.
      const checked = reply?.text ? reviewAiOutput(reply.text, reply.payload) : null;
      setAnswer(checked
        ? { ...reply, overreached: checked.overreached, citedWithheld: checked.citedWithheld }
        : (reply || { text: `${GENIE_NAME} went quiet. Try again in a moment.` }));
      setQuestion("");
    } catch (e) {
      // A failed call should not silently eat a wish either -- the
      // server only counts what it actually answered.
      setAnswer({ text: `Couldn't reach ${GENIE_NAME}. That one's still yours.`, failed: true });
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      {/* The lamp. Above the content, clear of the nav bar and the iOS
          home indicator. */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={`Ask ${GENIE_NAME}, the bowling genie`}
        style={{
          position: "fixed",
          right: "16px",
          bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
          width: "52px", height: "52px", borderRadius: "26px",
          backgroundColor: C.card,
          border: `1px solid ${C.accent}55`,
          boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
          lineHeight: 1, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, WebkitTapHighlightColor: "transparent",
          opacity: canAsk ? 1 : 0.55,
        }}>
        {/* Drawn, not an emoji.

            The nearest emoji is a diya -- an oil lamp of entirely the
            wrong shape -- and Unicode has no Aladdin lamp. Drawing it
            also means it looks the same on every phone rather than
            whatever that OS decided a lamp should be.

            Two details that took several passes and are easy to undo by
            accident:

            The spout sweeps UP from the belly. Drooping below it, which
            is the obvious way to draw a spout, loses the silhouette
            entirely.

            The handle is a CLOSED loop, joined to the body at the
            shoulder and again at the waist. A detached curve beside a
            tapered body reads as a person with an arm out. */}
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <ellipse cx="16.6" cy="27" rx="4.2" ry="1.1" fill={C.accent} opacity="0.75"/>
          <path d="M15.1 24.4h3l.6 2.2h-4.2z" fill={C.accent} opacity="0.75"/>
          <path d="M23.4 16.4c2.9.6 4.8 2.2 4.8 4.1 0 2-2.1 3.5-5 3.8l-.5-1.8c1.9-.2 3.3-1 3.3-2 0-.9-1.1-1.7-2.9-2.1z" fill={C.accent}/>
          <path d="M9.6 19c0-2.5 3.2-4.1 7-4.1s7 1.6 7 4.1c0 2.2-1.4 3.9-3.1 5-1 .6-1.9.8-3.9.8s-2.9-.2-3.9-.8c-1.7-1.1-3.1-2.8-3.1-5z" fill={C.accent}/>
          <path d="M9.8 18.3C7.1 17 3.9 14.3 2.3 11.2c.8 3.5 3.4 6.6 6.4 8.4z" fill={C.accent}/>
          <path d="M13.2 14.8c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3z" fill={C.accent} opacity="0.85"/>
          <circle cx="16.6" cy="10.6" r="1.5" fill={C.accent} opacity="0.75"/>
        </svg>

        {/* How many are left, without opening it. */}
        {left > 0 && left < DAILY_QUESTIONS && (
          <span style={{
            position: "absolute", top: "-2px", right: "-2px",
            minWidth: "18px", height: "18px", borderRadius: "9px",
            backgroundColor: C.accent, color: C.bg,
            fontSize: "10px", fontWeight: 700, lineHeight: "18px",
            textAlign: "center",
          }}>{left}</span>
        )}
      </button>

      {/* Tapping anywhere else closes it.

          An invisible full-screen layer BEHIND the panel and above
          everything else. Without it the only way out was the lamp
          again, which is not where anyone looks to dismiss something --
          and taps meant for the panel's surroundings were landing on
          whatever screen was underneath.

          Below the panel and the lamp in z-order (199 against 200) so
          both stay clickable; the lamp keeps working as a toggle. */}
      {/* A backdrop, so tapping anywhere else closes the panel.

          Without one the only way out was the lamp itself, which is not
          where anyone looks to dismiss something. It also stops a tap
          meant for "close" landing on whatever screen is behind the
          panel and doing something unintended.

          Transparent rather than dimmed: this is a small panel over a
          working screen, not a modal, and darkening everything would
          overstate it. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, zIndex: 199 }}
        />
      )}

      {open && (
        <div style={{
          position: "fixed", left: "12px", right: "12px",
          bottom: "calc(144px + env(safe-area-inset-bottom, 0px))",
          backgroundColor: C.card, borderRadius: "14px",
          // Accent, not the neutral border every other card uses.
          //
          // The panel floats over a working screen rather than dimming
          // it, so it has to separate itself from whatever is behind --
          // and a 1px neutral line against a card background does not.
          // The accent also ties it to the lamp that opened it.
          border: `1.5px solid ${C.accent}`,
          boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
          padding: "14px", zIndex: 200, maxWidth: "460px", margin: "0 auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: C.text }}>{GENIE_NAME}</div>
            <div style={{ fontSize: "11px", color: C.textMuted }}>{budgetLabel(asked, today)}</div>
          </div>

          {!canAsk && !answer && (
            <div style={{ fontSize: "12px", color: C.textMuted, lineHeight: 1.5 }}>
              You've used all {DAILY_QUESTIONS} today. {GENIE_NAME} is back tomorrow.
            </div>
          )}

          {canAsk && (
            <>
              <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px", lineHeight: 1.5 }}>
                Ask about your own bowling — {GENIE_NAME} can see your scores, spares, splits and which balls
                you've been throwing.
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0, fontSize: "12px" }}
                  value={question}
                  onChange={e => { setQuestion(e.target.value); setFreeRefusal(""); }}
                  onKeyDown={e => { if (e.key === "Enter") ask(); }}
                  placeholder="Why do I keep leaving the 10?"
                  disabled={thinking} />
                <button
                  style={{ ...S.btn("primary"), width: "auto", flexShrink: 0, padding: "9px 16px", fontSize: "13px" }}
                  disabled={!question.trim() || thinking}
                  onClick={ask}>
                  {thinking ? "…" : "Ask"}
                </button>
              </div>
            </>
          )}

          {/* Free refusal. Says outright that it cost nothing, because
              otherwise people assume it did. */}
          {freeRefusal && (
            <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "10px", lineHeight: 1.5 }}>
              {freeRefusal}
            </div>
          )}

          {answer && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "13px", color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {answer.text}
              </div>
              {/* Only on a real answer. A connection failure is not an AI
                  claim about your bowling and does not need caveating. */}
              {answer.overreached && (
                <div style={{ fontSize: "11px", color: C.miss, lineHeight: 1.5, marginTop: "8px" }}>
                  {overreachNote(answer.citedWithheld)}
                </div>
              )}
              {!answer.failed && <AiNote what="That" />}
            </div>
          )}
        </div>
      )}
    </>
  );
}
