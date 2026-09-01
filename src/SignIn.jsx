import { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#22263a",
  accent: "#4a9eff", accentDim: "#1e3a5f",
  strike: "#22c55e", spare: "#f59e0b", miss: "#ef4444",
  text: "#e8eaf0", textMuted: "#8892a4", border: "#2e3347",
};

export default function SignIn() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    const { error } = await signInWithMagicLink(email.trim());
    if (error) {
      setStatus("error");
      setErrorMsg(error.message || "Couldn't send the link. Try again.");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: C.bg, color: C.text,
      fontFamily: "'Inter',system-ui,sans-serif", fontSize: "14px",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: "360px", backgroundColor: C.card,
        borderRadius: "12px", padding: "28px 24px", border: `1px solid ${C.border}`,
      }}>
        <div style={{
          fontSize: "16px", fontWeight: 700, letterSpacing: "0.05em",
          color: C.accent, textTransform: "uppercase", textAlign: "center", marginBottom: "6px",
        }}>
          🎳 Shot Tracker
        </div>
        <div style={{ fontSize: "12px", color: C.textMuted, textAlign: "center", marginBottom: "24px" }}>
          Sign in to log your own games and see the team's stats.
        </div>

        {status === "sent" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "10px" }}>📬</div>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>Check your email</div>
            <div style={{ fontSize: "12px", color: C.textMuted, marginBottom: "16px" }}>
              We sent a sign-in link to <span style={{ color: C.text }}>{email}</span>. Open it on this device to finish signing in.
            </div>
            <button
              onClick={() => { setStatus("idle"); setEmail(""); }}
              style={{
                background: "none", border: "none", color: C.accent,
                fontSize: "12px", cursor: "pointer", WebkitTapHighlightColor: "transparent",
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", backgroundColor: C.surface, border: `1px solid ${C.border}`,
                borderRadius: "8px", padding: "12px", color: C.text, fontSize: "14px",
                boxSizing: "border-box", outline: "none", marginBottom: "12px",
              }}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                width: "100%", padding: "12px 20px", borderRadius: "10px", border: "none",
                cursor: status === "sending" ? "default" : "pointer",
                fontSize: "14px", fontWeight: 700,
                backgroundColor: C.accent, color: "#fff",
                opacity: status === "sending" ? 0.6 : 1,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {status === "sending" ? "Sending…" : "Send Sign-In Link"}
            </button>
            {status === "error" && (
              <div style={{ fontSize: "12px", color: C.miss, marginTop: "10px", textAlign: "center" }}>
                {errorMsg}
              </div>
            )}
            <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "14px", textAlign: "center" }}>
              No password needed — we'll email you a link that signs you in.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
