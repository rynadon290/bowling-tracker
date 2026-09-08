import { useState } from "react";
import { C, S, F } from "./ui.jsx";
import { shareText, shareTitle, drawShareCard, drawTrendCard, trendShareText, drawShareQr } from "./domain/shareCard.js";

// One tap to share a night's scores.
//
// Three tiers, best available first:
//   1. Native share sheet WITH the summary image (iOS, Android Chrome).
//      The picture is what gets posted; the text carries the link.
//   2. Native share sheet with text only, where files aren't supported.
//   3. Copy to clipboard, with the button saying so, for desktop or an
//      old browser. Nothing here can fail silently -- a share button
//      that does nothing is worse than no button.
//
// The attribution is in the text on every tier and drawn into the image
// on tier 1, so however it's shared, it says where it came from.

async function renderCardBlob(summary) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // A trend is a shape over time, not a scoreline -- it gets the graph
    // card instead of the score card.
    if (summary?.trend) drawTrendCard(ctx, { ...summary, colors: C, fonts: F });
    else drawShareCard(ctx, { ...summary, colors: C, fonts: F });
    // Additive: mark+name+url are already drawn above, so a QR that
    // fails to load (offline, package unavailable) still leaves a card
    // that says where it came from -- it just can't be scanned.
    try {
      const { default: QRCode } = await import("qrcode");
      await drawShareQr(ctx, 900, summary?.trend ? 940 : 890, 130, QRCode);
    } catch {}
    return await new Promise(res => canvas.toBlob(res, "image/png"));
  } catch {
    return null;
  }
}

export default function ShareButton({ summary, label = "Share", compact = false }) {
  const [state, setState] = useState("idle"); // idle | working | copied | done | failed

  async function share() {
    setState("working");
    const text = summary?.trend ? trendShareText(summary) : shareText(summary);
    const title = summary?.trend ? (summary.label || "Trend") : shareTitle(summary);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        const blob = await renderCardBlob(summary);
        if (blob && navigator.canShare) {
          const file = new File([blob], "board-and-arrow.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title, text, files: [file] });
            setState("done"); setTimeout(() => setState("idle"), 1500);
            return;
          }
        }
        await navigator.share({ title, text });
        setState("done"); setTimeout(() => setState("idle"), 1500);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setState("copied"); setTimeout(() => setState("idle"), 2000);
        return;
      }
      setState("failed"); setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      // AbortError is the person closing the sheet -- not a failure.
      if (e && e.name === "AbortError") { setState("idle"); return; }
      setState("failed"); setTimeout(() => setState("idle"), 2000);
    }
  }

  const caption =
    state === "working" ? "Preparing…" :
    state === "copied" ? "Copied — paste it anywhere" :
    state === "done" ? "Shared" :
    state === "failed" ? "Couldn't share on this device" :
    label;

  return (
    <button onClick={share} disabled={state === "working"}
      style={compact
        ? { ...S.btn(), padding: "8px 12px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }
        : { ...S.btn(), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
      aria-label={`Share ${shareTitle(summary)}`}>
      <span aria-hidden="true">↗</span>
      {caption}
    </button>
  );
}
