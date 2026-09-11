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
export function shareText(arg) {
  // A default parameter covers undefined, not null.
  const { bowler, scores, league, date, environment, highlights = [] } = (arg && typeof arg === "object") ? arg : {};
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
export function shareTitle(arg) {
  // A default parameter covers undefined, not null.
  const { bowler, scores } = (arg && typeof arg === "object") ? arg : {};
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
export function sessionHighlights(arg) {
  // A null session is what a caller passes before a night has loaded.
  const {
  scores = [], strikes = 0, shotCount = 0, sparesMade = 0, spareAttempts = 0,
  cleanGames = 0, goalsHit = [], moneyWon = 0, priorBest = null,
  priorAverage = null, environment = "league",
} = (arg && typeof arg === "object") ? arg : {};

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

// ── Sharing a TREND, which is a different picture ───────────────────────
//
// A trend is a shape over time, not a scoreline. Feeding its points into
// drawShareCard as `scores` produced two bugs at once: the games were
// summed into a nonsense "9825 series", and 50 of them drawn 220px apart
// ran ~11,000px wide on a 1080px card -- the overflow being the black bar.
//
// So a trend gets its own card: the line itself, with high, low and
// average, and no series total anywhere.
export function drawTrendCard(ctx, { bowler, label, points, league, colors, fonts }) {
  if (!ctx) return null;
  const W = 1080, H = 1080;
  const c = colors || {};
  const vals = (Array.isArray(points) ? points : []).map(p => (typeof p === "number" ? p : p?.value))
    .filter(v => Number.isFinite(v));

  ctx.fillStyle = c.bg || "#14110E";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 34px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.textBaseline = "top";
  ctx.fillText([bowler, league ? league.replace(" House Shot", "") : ""].filter(Boolean).join("   "), 80, 84);

  ctx.fillStyle = c.text || "#F4F0E6";
  ctx.font = `700 60px ${fonts?.display || fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText(label || "Trend", 80, 132);

  if (!vals.length) return true;

  const hi = Math.max(...vals), lo = Math.min(...vals);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

  // The graph. Padded so a flat line doesn't sit on the axis, and scaled
  // to the data rather than to zero -- a bowling average never starts at
  // zero, and anchoring there flattens every real change into a
  // straight line.
  const left = 90, right = W - 90, top = 300, bottom = 720;
  const span = Math.max(1, hi - lo);
  const x = i => left + (vals.length === 1 ? (right - left) / 2 : (i / (vals.length - 1)) * (right - left));
  const y = v => bottom - ((v - lo) / span) * (bottom - top);

  ctx.strokeStyle = c.border || "#332B22";
  ctx.lineWidth = 2;
  for (let g = 0; g <= 3; g++) {
    const gy = top + (g / 3) * (bottom - top);
    ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(right, gy); ctx.stroke();
  }

  ctx.strokeStyle = c.accent || "#E8A33D";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  vals.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.stroke();

  // Dots only when there are few enough to be distinguishable; at 50
  // points they merge into a caterpillar and hurt readability.
  if (vals.length <= 20) {
    ctx.fillStyle = c.accent || "#E8A33D";
    vals.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v), 9, 0, Math.PI * 2); ctx.fill(); });
  }

  // High / low / average, which is what a trend is actually about.
  const stats = [["High", hi], ["Average", avg], ["Low", lo]];
  stats.forEach(([name, val], i) => {
    const sx = 80 + i * 320;
    ctx.fillStyle = c.text || "#F4F0E6";
    ctx.font = `700 76px ${fonts?.num || "system-ui, sans-serif"}`;
    ctx.fillText(String(val), sx, 790);
    ctx.fillStyle = c.textMuted || "#9A8F80";
    ctx.font = `500 30px ${fonts?.body || "system-ui, sans-serif"}`;
    ctx.fillText(name, sx, 880);
  });

  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 28px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText(`${vals.length} games`, 80, 934);

  // Mark, name AND url -- the score card already had all three; this
  // card was missing the url, so a screenshot of it said what app made
  // it but not where to get it.
  drawArrowMark(ctx, 80, 985, 34, c.accent || "#E8A33D");
  ctx.fillStyle = c.accent || "#E8A33D";
  ctx.font = `700 34px ${fonts?.display || "system-ui, sans-serif"}`;
  ctx.fillText(APP_NAME, 128, 978);
  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 26px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText(APP_URL.replace(/^https?:\/\//, ""), 128, 1015);

  return true;
}

// Text for a shared trend. No series total -- summing a season of games
// produces a number that means nothing.
export function trendShareText(arg) {
  // A default parameter covers undefined, not null.
  const { bowler, label, points, league } = (arg && typeof arg === "object") ? arg : {};
  const vals = (Array.isArray(points) ? points : []).map(p => (typeof p === "number" ? p : p?.value))
    .filter(v => Number.isFinite(v));
  if (!vals.length) return `${label || "Trend"}\n\nTracked with ${APP_NAME} — ${APP_URL}`;
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const where = league ? ` at ${league.replace(" House Shot", "")}` : "";
  return [
    `${bowler ? bowler + "'s " : ""}${label || "trend"}${where}`,
    `${vals.length} games — averaging ${avg}, high ${hi}, low ${lo}.`,
    "",
    `Tracked with ${APP_NAME} — ${APP_URL}`,
  ].join("\n");
}

// ── Standings ──────────────────────────────────────────────────────────
//
// Focus group Finding 4: 9 of 50 looked for a way to share the running
// table, not just one night. The night recap had a share and the
// standings did not, which is backwards for the thing people said they
// would install the app to settle arguments with.
//
// Ranked by AVERAGE, matching CasualLeaderboard -- people bowl different
// numbers of games, and the games count travels alongside so a
// three-game average is not mistaken for a thirty-game one.
export function drawStandingsCard(ctx, { rows, me, colors, fonts }) {
  if (!ctx) return null;
  const W = 1080, H = 1080;
  const c = colors || {};
  // Rows are filtered to real objects, not merely checked for being an
  // array. A null or a stray number in the list throws on .bowler and
  // takes the whole share down with it -- HANDOFF 4.4, guards that
  // check null but not type. My first version of this did exactly
  // that, and a test caught it.
  const list = (Array.isArray(rows) ? rows : [])
    .filter(r => r && typeof r === "object")
    .slice(0, 10);

  ctx.fillStyle = c.bg || "#14110E";
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "top";
  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 34px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText("Just Bowling", 80, 84);

  ctx.fillStyle = c.text || "#F4F0E6";
  ctx.font = `700 60px ${fonts?.display || fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText("Standings", 80, 132);

  if (!list.length) {
    ctx.fillStyle = c.textMuted || "#9A8F80";
    ctx.font = `500 30px ${fonts?.body || "system-ui, sans-serif"}`;
    ctx.fillText("No nights bowled yet.", 80, 260);
  }

  let y = 268;
  const rowH = 66;
  list.forEach((r, i) => {
    const mine = !!me && r.bowler === me;
    if (i > 0) {
      ctx.strokeStyle = c.border || "#332B22";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(80, y - 10); ctx.lineTo(W - 80, y - 10); ctx.stroke();
    }
    // The bowler's own row is marked, because the first thing anyone
    // does with a table they are in is look for themselves.
    ctx.fillStyle = mine ? (c.accent || "#E8A33D") : (c.textMuted || "#9A8F80");
    ctx.font = `700 34px ${fonts?.body || "system-ui, sans-serif"}`;
    ctx.fillText(String(i + 1), 80, y + 6);

    ctx.fillStyle = mine ? (c.accent || "#E8A33D") : (c.text || "#F4F0E6");
    ctx.font = `${mine ? 700 : 500} 38px ${fonts?.body || "system-ui, sans-serif"}`;
    ctx.fillText(String(r.bowler || "").slice(0, 22), 150, y);

    ctx.textAlign = "right";
    ctx.fillStyle = c.text || "#F4F0E6";
    ctx.font = `700 40px ${fonts?.display || fonts?.body || "system-ui, sans-serif"}`;
    ctx.fillText(String(r.average ?? ""), W - 200, y);
    ctx.fillStyle = c.textMuted || "#9A8F80";
    ctx.font = `500 26px ${fonts?.body || "system-ui, sans-serif"}`;
    ctx.fillText(`${r.games ?? 0}g`, W - 80, y + 10);
    ctx.textAlign = "left";

    y += rowH;
  });

  drawArrowMark(ctx, 80, 985, 34, c.accent || "#E8A33D");
  ctx.fillStyle = c.accent || "#E8A33D";
  ctx.font = `700 34px ${fonts?.display || "system-ui, sans-serif"}`;
  ctx.fillText(APP_NAME, 128, 978);
  ctx.fillStyle = c.textMuted || "#9A8F80";
  ctx.font = `500 26px ${fonts?.body || "system-ui, sans-serif"}`;
  ctx.fillText(APP_URL.replace(/^https?:\/\//, ""), 128, 1015);

  return true;
}

// Text for shared standings, for every tier below the image share.
export function standingsShareText(arg) {
  // A default parameter covers undefined, not null.
  const { rows, me } = (arg && typeof arg === "object") ? arg : {};
  // Rows are filtered to real objects, not merely checked for being an
  // array. A null or a stray number in the list throws on .bowler and
  // takes the whole share down with it -- HANDOFF 4.4, guards that
  // check null but not type. My first version of this did exactly
  // that, and a test caught it.
  const list = (Array.isArray(rows) ? rows : [])
    .filter(r => r && typeof r === "object")
    .slice(0, 10);
  if (!list.length) return `Standings\n\nTracked with ${APP_NAME} — ${APP_URL}`;
  const lines = list.map((r, i) =>
    `${i + 1}. ${r.bowler}${!!me && r.bowler === me ? " (me)" : ""} — ${r.average} avg, ${r.games ?? 0} games`);
  return ["Standings", ...lines, "", `Tracked with ${APP_NAME} — ${APP_URL}`].join("\n");
}

// ── QR code, for a card that gets printed or just looked at ─────────────
//
// The url text works when the card is viewed on a phone -- someone can
// read it and type it in. It does nothing for a screenshot posted to
// Instagram, a photo of a phone screen, or a printed scoresheet pinned to
// a league board. A QR code is tappable from a photo of a photo.
//
// Optional and drawn last, so it's additive to the mark+name+url that
// already carry attribution -- if the QR can't be generated (offline, the
// qrcode package unavailable) the card still says where it came from.
export async function drawShareQr(ctx, x, y, size, QRCode) {
  if (!ctx || !QRCode) return false;
  try {
    const dataUrl = await QRCode.toDataURL(APP_URL, { width: size, margin: 0 });
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    // A small quiet plate behind it: a QR code needs contrast to scan,
    // and it's drawn near the accent-colored wordmark, not guaranteed
    // to sit on the plain background.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x - 8, y - 8, size + 16, size + 16);
    ctx.drawImage(img, x, y, size, size);
    return true;
  } catch {
    return false;
  }
}
