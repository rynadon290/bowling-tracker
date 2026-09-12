import { useState } from "react";
import { C, S, AiNote } from "./ui.jsx";
import {
  classifyQuestion, refusalMessage, questionsLeftToday, canAskToday,
  budgetLabel, DAILY_QUESTIONS,
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
export default function BowlingGenie({
  asked = [], today = "", onAsk, disabled = false,
}) {
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
      setAnswer(reply || { text: "The lamp went quiet. Try again in a moment." });
      setQuestion("");
    } catch (e) {
      // A failed call should not silently eat a wish either -- the
      // server only counts what it actually answered.
      setAnswer({ text: "Couldn't reach the lamp. That one's still yours.", failed: true });
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
        aria-label="Ask the bowling genie"
        style={{
          position: "fixed",
          right: "16px",
          bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
          width: "52px", height: "52px", borderRadius: "26px",
          backgroundColor: C.card,
          border: `1px solid ${C.accent}55`,
          boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
          fontSize: "26px", lineHeight: 1, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, WebkitTapHighlightColor: "transparent",
          opacity: canAsk ? 1 : 0.55,
        }}>
        <span aria-hidden="true">{"\u{1FA94}"}</span>
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

      {open && (
        <div style={{
          position: "fixed", left: "12px", right: "12px",
          bottom: "calc(144px + env(safe-area-inset-bottom, 0px))",
          backgroundColor: C.card, borderRadius: "14px",
          border: `1px solid ${C.border}`,
          boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
          padding: "14px", zIndex: 200, maxWidth: "460px", margin: "0 auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: C.text }}>Bowling genie</div>
            <div style={{ fontSize: "11px", color: C.textMuted }}>{budgetLabel(asked, today)}</div>
          </div>

          {!canAsk && !answer && (
            <div style={{ fontSize: "12px", color: C.textMuted, lineHeight: 1.5 }}>
              You've used all {DAILY_QUESTIONS} today. The lamp recharges tomorrow.
            </div>
          )}

          {canAsk && (
            <>
              <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px", lineHeight: 1.5 }}>
                Ask about your own bowling — it can see your scores, spares, splits and which balls
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
              {!answer.failed && <AiNote what="That" />}
            </div>
          )}
        </div>
      )}
    </>
  );
}
