// Sharing a night's scores.
//
// The share itself is just text plus, where the device supports it, a
// picture of the summary card. Both carry the app name and the link,
// because a screenshot of three numbers tells nobody where it came from
// -- and "where did you get that?" is the whole growth loop for a free
// app that casual bowlers use once.
//
// Text first: it's what every share target accepts. The image is a bonus
// for the ones that show it (Messages, Instagram, WhatsApp).

import { APP_NAME } from "../constants.js";

export const APP_URL = "https://rynadon290.github.io/bowling-tracker/";

function scoresLine(scores) {
  const clean = (Array.isArray(scores) ? scores : []).filter(v => Number.isFinite(v));
  return clean.length ? clean.join("  ·  ") : "";
}

// One summary in plain words, the way a bowler would text it. No stats
// jargon: "617 series" not "series: 617"; a single game is just the
// score.
export function shareText({ bowler, scores, league, date, environment, highlights = [] } = {}) {
  const clean = (Array.isArray(scores) ? scores : []).filter(v => Number.isFinite(v));
  const series = clean.reduce((a, b) => a + b, 0);
  const who = bowler ? `${bowler} bowled` : "Bowled";
  const where = league ? ` at ${league.replace(" House Shot", "")}` : "";
  const when = date ? ` on ${date}` : "";

  let headline;
  if (clean.length === 0) headline = `${who}${where}${when}.`;
  else if (clean.length === 1) headline = `${who} a ${clean[0]}${where}${when}.`;
  else headline = `${who} ${series} for ${clean.length}${where}${when}: ${scoresLine(clean)}.`;

  const extras = highlights.filter(Boolean).map(h => `• ${h}`);
  const tag = environment === "practice" ? "Practice session" : environment === "casual" ? "Just for fun" : "";

  return [
    headline,
    ...(extras.length ? ["", ...extras] : []),
    ...(tag ? ["", tag] : []),
    "",
    `Tracked with ${APP_NAME} — ${APP_URL}`,
  ].join("\n");
}

// A title for the share sheet, kept short because iOS shows it in the
// header of the sheet.
export function shareTitle({ bowler, scores } = {}) {
  const clean = (Array.isArray(scores) ? scores : []).filter(v => Number.isFinite(v));
  const series = clean.reduce((a, b) => a + b, 0);
  if (clean.length > 1) return `${bowler ? bowler + ": " : ""}${series} series`;
  if (clean.length === 1) return `${bowler ? bowler + ": " : ""}${clean[0]}`;
  return APP_NAME;
}

// Draws the summary card to a canvas. Returns null anywhere canvas isn't
// available (tests, old browsers), and the caller falls back to text.
//
// Sized for a phone share: 1080x1080 is what Instagram and most feeds
// crop least. Colours come from the active theme so the card matches
// what the bowler is looking at.
// The app mark: one lane arrow. Same geometry as the app icon
// (a triangle in the accent), so a shared card and the icon on a phone
// home screen are recognisably the same thing.
export function drawArrowMark(ctx, x, y, size, color) {
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y);
  ctx.lineTo(x + size, y + size);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();
  return true;
}

export function drawShareCard(ctx, { bowler, scores, league, date, colors, fonts }) {
  if (!ctx) return null;
  const W = 1080, H = 1080;
  const c = colors || {};
  const clean = (Array.isArray(scores) ? scores : []).filter(v => Number.isFinite(v));
  const series = clean.reduce((a, b) => a + b, 0);

  ctx.fillStyle = c.bg || "#14110E";
  ctx.fillRect(0, 0, W, H);

  // A lane, as in the app: 39 boards, arrows at 5/10/.../35. Structure
  // that means something, not a decorative stripe.
  const laneTop = 700, laneBottom = 940, boardW = (W - 160) / 39;
  for (let b = 1; b <= 39; b++) {
    const x = 80 + (b - 1) * boardW;
    const isArrow = b % 5 === 0 && b <= 35;
    ctx.fillStyle = isArrow ? (c.accent || "#E8A33D") : (c.border || "#332B22");
    ctx.globalAlpha = isArrow ? 0.35 : 1;
    const h = isArrow ? (laneBottom - laneTop) * 0.75 : (laneBottom - laneTop) * 0.55;
    ctx.fillRect(x + 1, laneBottom - h, boardW - 2, h);
  }
  ctx.globalAlpha = 1;

  // Name and where
  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 34px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.textBaseline = "top";
  const sub = [bowler, league ? league.replace(" House Shot", "") : "", date].filter(Boolean).join("   ");
  ctx.fillText(sub, 80, 90);

  // THE number
  ctx.fillStyle = c.text || "#F4F0E6";
  ctx.font = `700 300px ${fonts?.num || "system-ui, sans-serif"}`;
  ctx.fillText(clean.length > 1 ? String(series) : String(clean[0] ?? "—"), 72, 150);

  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 36px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText(clean.length > 1 ? `${clean.length}-game series` : clean.length === 1 ? "Game" : "", 84, 480);

  // The individual games
  if (clean.length > 1) {
    ctx.fillStyle = c.text || "#F4F0E6";
    ctx.font = `700 84px ${fonts?.num || "system-ui, sans-serif"}`;
    clean.forEach((s, i) => ctx.fillText(String(s), 84 + i * 220, 560));
    ctx.fillStyle = c.textMuted || "#9A8F80";
    ctx.font = `500 28px ${fonts?.body || "system-ui, sans-serif"}`;
    clean.forEach((_, i) => ctx.fillText(`Game ${i + 1}`, 88 + i * 220, 650));
  }

  // Attribution. Always present, always readable: this is the line that
  // makes a shared card also an invitation.
  //
  // The mark is drawn, not loaded: a share can happen offline, and an
  // image that silently loses its logo is worse than one that draws it
  // every time. It's a single triangle -- the lane arrow the app is
  // named for -- so drawing it costs nothing.
  drawArrowMark(ctx, 80, 962, 42, c.accent || "#E8A33D");

  ctx.fillStyle = c.accent || "#E8A33D";
  ctx.font = `700 40px ${fonts?.display || "system-ui, sans-serif"}`;
  ctx.fillText(APP_NAME, 140, 975);
  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 30px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText(APP_URL.replace(/^https?:\/\//, ""), 140, 1025);

  return true;
}
