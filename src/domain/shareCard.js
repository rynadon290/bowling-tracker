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

export function drawShareCard(ctx, { bowler, scores, league, date, colors, fonts, highlights }) {
  if (!ctx) return null;
  const W = 1080, H = 1080;
  const c = colors || {};
  const clean = (Array.isArray(scores) ? scores : []).filter(v => Number.isFinite(v));
  const series = clean.reduce((a, b) => a + b, 0);

  ctx.fillStyle = c.bg || "#14110E";
  ctx.fillRect(0, 0, W, H);

  // The vault wheel, matching the app icon.
  //
  // Was a 39-board lane with every 5th board lit. That was right for
  // "Board & Arrow"; it says nothing about a vault, and a shared card
  // should look like the app it came from -- that's the whole point of
  // putting it on someone's feed.
  //
  // Drawn low and large behind the attribution, dim enough not to
  // compete with the score.
  const wheelX = W - 210, wheelY = H - 210, spokeR = 130, hubR = 58;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 8; i++) {
    const a = (i * 45) * Math.PI / 180;
    ctx.strokeStyle = c.border || "#332B22";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(wheelX, wheelY);
    ctx.lineTo(wheelX + Math.sin(a) * spokeR, wheelY - Math.cos(a) * spokeR);
    ctx.stroke();
  }
  ctx.fillStyle = c.accent || "#E8A33D";
  ctx.beginPath();
  ctx.arc(wheelX, wheelY, hubR, 0, Math.PI * 2);
  ctx.fill();
  // The three finger holes, so it reads as a ball at the hub.
  ctx.fillStyle = c.bg || "#14110E";
  for (const [dx, dy] of [[-18, -22], [18, -22], [0, 8]]) {
    ctx.beginPath();
    ctx.arc(wheelX + dx, wheelY + dy, 8, 0, Math.PI * 2);
    ctx.fill();
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

  // Highlights on the image itself. The text carries them for every
  // share target, but the picture is what actually gets looked at -- a
  // card showing only three numbers wastes the moment.
  const hl = (highlights || []).slice(0, 3);
  if (hl.length) {
    ctx.font = `500 34px ${fonts?.body || "system-ui, sans-serif"}`;
    hl.forEach((line, i) => {
      ctx.fillStyle = c.accent || "#E8A33D";
      ctx.fillText("\u2022", 84, 700 + i * 52);
      ctx.fillStyle = c.text || "#F4F0E6";
      ctx.fillText(String(line), 116, 700 + i * 52);
    });
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

// ── What's worth saying about a night ──────────────────────────────────
//
// "203 · 221 · 193" is a scoreline, not a story. What a bowler actually
// wants to post is the thing that made the night good: a goal they hit,
// money they won, a personal best, a clean game.
//
// Ordered by what a bowler would lead with, and capped -- three good
// lines beat eight mediocre ones, and a share that scrolls doesn't get
// read. Everything is derived from data already on the session, so this
// adds no new tracking burden.
export function sessionHighlights({
  scores = [], strikes = 0, shotCount = 0, sparesMade = 0, spareAttempts = 0,
  cleanGames = 0, goalsHit = [], moneyWon = 0, priorBest = null,
  priorAverage = null, environment = "league",
} = {}) {
  const out = [];
  const clean = scores.filter(v => Number.isFinite(v));
  const series = clean.reduce((a, b) => a + b, 0);
  const high = clean.length ? Math.max(...clean) : null;

  // 1. Money first -- it's the least common and the most fun to post.
  if (moneyWon > 0) out.push(`Won $${moneyWon} in side pots`);

  // 2. A goal you set and then hit is the whole point of setting it.
  for (const g of goalsHit.slice(0, 2)) out.push(`Hit my goal: ${g}`);

  // 3. Personal bests, which people genuinely brag about.
  if (priorBest != null && clean.length > 1 && series > priorBest) {
    out.push(`New personal best series — beat ${priorBest}`);
  } else if (priorBest != null && high != null && clean.length === 1 && high > priorBest) {
    out.push(`New personal best game — beat ${priorBest}`);
  }

  // 4. Clean games: no open frames is a real bowling achievement and
  //    reads better than a percentage.
  if (cleanGames === clean.length && clean.length > 0) out.push("Clean card — no open frames");
  else if (cleanGames > 0) out.push(`${cleanGames} clean game${cleanGames === 1 ? "" : "s"}`);

  // 5. Beating your own average, which is the everyday version of a win.
  if (priorAverage != null && clean.length) {
    const avg = Math.round(series / clean.length);
    const diff = avg - Math.round(priorAverage);
    if (diff >= 5) out.push(`${diff} pins over my average`);
  }

  // 6. Rates last, and only when they're actually good -- posting "48%
  //    strikes" helps nobody.
  const strikePct = shotCount ? Math.round((strikes / shotCount) * 100) : null;
  if (strikePct != null && strikePct >= 55) out.push(`${strikePct}% strikes`);
  const sparePct = spareAttempts ? Math.round((sparesMade / spareAttempts) * 100) : null;
  if (sparePct != null && sparePct >= 80) out.push(`${sparePct}% spares`);

  return out.slice(0, 4);
}
