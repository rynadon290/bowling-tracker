import { Component } from "react";
import { C, S } from "./ui.jsx";
import { recordError } from "./errorLogStore.js";

// A crash in any screen used to unmount the entire app, leaving a blank
// white page with nothing on it — no message, no way back, and nothing
// to report except "it went white".
//
// This catches the error, keeps the rest of the app alive, and shows
// what actually broke. On a phone there are no dev tools, so if the app
// doesn't say what went wrong, nobody can.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Still log it, for anyone who does have a console.
    console.error("Screen crashed:", error, info?.componentStack);
    // And to the error log, because a console nobody opens is not a
    // record. The component stack names the screen; the message is
    // redacted before it is stored.
    recordError({
      kind: "render",
      where: (info?.componentStack || "").trim().split("\n")[0].trim().replace(/^at\s+/, "").slice(0, 60),
      message: error?.message || String(error || ""),
    });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const where = (info?.componentStack || "")
      .split("\n").map(l => l.trim()).filter(Boolean).slice(0, 4).join("\n");

    return (
      <div style={{ ...S.card, border: `1px solid ${C.miss}66` }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: C.miss, marginBottom: "6px" }}>
          This screen hit a problem
        </div>
        <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "10px", lineHeight: 1.5 }}>
          Your data is safe — nothing was lost. The rest of the app still works,
          so you can switch to another tab.
        </div>

        {/* The actual error, shown rather than swallowed. This is the
            only way to find out what broke on a phone. */}
        <div style={{
          fontFamily: "monospace", fontSize: "11px", lineHeight: 1.5,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: "8px", padding: "10px", color: C.text,
          whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: "10px",
        }}>
          {String(error?.message || error)}
          {where ? `\n\n${where}` : ""}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ ...S.btn(), flex: 1 }}
            onClick={() => this.setState({ error: null, info: null })}>
            Try again
          </button>
          <button style={{ ...S.btn(), flex: 1 }}
            onClick={() => {
              const text = `${String(error?.message || error)}\n\n${where}`;
              try { navigator.clipboard?.writeText(text); } catch { /* nothing to do */ }
            }}>
            Copy details
          </button>
        </div>
      </div>
    );
  }
}
