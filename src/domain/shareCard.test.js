import { describe, it, expect } from 'vitest';
import { shareText, shareTitle, drawShareCard, APP_URL,
  drawTrendCard,
  trendShareText,
  drawShareQr,
} from './shareCard.js';
import { APP_NAME } from '../constants.js';

describe('share text', () => {
  const night = { bowler: 'Ryan', scores: [203, 221, 193], league: 'Tuesday House Shot', date: 'Tue, Sep 1' };

  // A screenshot of three numbers tells nobody where it came from.
  it('always names the app and links to it', () => {
    for (const s of [night, { bowler: 'Kim', scores: [142] }, {}]) {
      const t = shareText(s);
      expect(t).toContain(APP_NAME);
      expect(t).toContain(APP_URL);
    }
  });

  it('reads like a text message, not a stats dump', () => {
    const t = shareText(night);
    expect(t).toContain('Ryan bowled 617 for 3');
    expect(t).toContain('203  ·  221  ·  193');
    expect(t).not.toContain('series:');
  });

  it('handles a single casual game without inventing a series', () => {
    const t = shareText({ bowler: 'Kim', scores: [142], environment: 'casual' });
    expect(t).toContain('Kim bowled a 142');
    expect(t).not.toContain('for 1');
    expect(t).toContain('Just for fun');
  });

  it('includes highlights as bullets and skips empty ones', () => {
    const t = shareText({ bowler: 'R', scores: [200, 200, 200], highlights: ['Ten pins 8 of 9', null, ''] });
    expect(t).toContain('• Ten pins 8 of 9');
    expect(t.split('•').length - 1).toBe(1);
  });

  it('survives having nothing', () => {
    expect(shareText({})).toContain(APP_NAME);
    expect(shareText()).toContain(APP_URL);
  });
});

describe('share title', () => {
  it('is the series for a night, the score for a game, the app for nothing', () => {
    expect(shareTitle({ bowler: 'Ryan', scores: [203, 221, 193] })).toBe('Ryan: 617 series');
    expect(shareTitle({ scores: [142] })).toBe('142');
    expect(shareTitle({})).toBe(APP_NAME);
  });
});

describe('share card', () => {
  // Every drawing call recorded, so we can assert the attribution was
  // actually drawn rather than just present in the text.
  function fakeCtx() {
    const calls = [];
    return { calls,
      fillRect() { calls.push(['rect']); },
      fillText(t) { calls.push(['text', t]); },
      // Path methods: the logo is drawn rather than loaded, so a share
      // works offline.
      beginPath() { calls.push(['path']); }, moveTo() {}, lineTo() {}, closePath() {}, fill() { calls.push(['fill']); },
      // The vault wheel strokes spokes and arcs the hub.
      stroke() { calls.push(['stroke']); }, arc() { calls.push(['arc']); },
      set strokeStyle(v) {}, set lineWidth(v) {}, set lineCap(v) {},
      set fillStyle(v) {}, set font(v) {}, set textBaseline(v) {}, set globalAlpha(v) {},
    };
  }

  it('draws the app name and the link onto the image', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { bowler: 'Ryan', scores: [203, 221, 193] });
    const texts = ctx.calls.filter(c => c[0] === 'text').map(c => c[1]);
    expect(texts).toContain(APP_NAME);
    expect(texts.some(t => APP_URL.includes(t))).toBe(true);
  });

  it('draws the series big and each game beneath', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { bowler: 'Ryan', scores: [203, 221, 193] });
    const texts = ctx.calls.filter(c => c[0] === 'text').map(c => c[1]);
    expect(texts).toContain('617');
    expect(texts).toContain('203');
  });

  // Replaced: the 39-board lane belonged to "Board & Arrow". The app is
  // My Bowling Vault now, and a shared card should look like the app it
  // came from -- that's the point of putting it on someone's feed.
  it('draws the vault wheel: 8 spokes, a hub and three finger holes', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { scores: [200] });
    expect(ctx.calls.filter(c => c[0] === 'stroke')).toHaveLength(8);
    expect(ctx.calls.filter(c => c[0] === 'arc')).toHaveLength(4);
  });

  it('draws highlights onto the image, not just into the text', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { scores: [200], highlights: ['Won $45 in side pots'] });
    const texts = ctx.calls.filter(c => c[0] === 'text').map(c => c[1]);
    expect(texts).toContain('Won $45 in side pots');
  });

  // The mark is drawn, not loaded, so a share that happens offline still
  // carries the logo.
  it('draws the arrow mark without loading an image', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { scores: [200] });
    expect(ctx.calls.some(c => c[0] === 'path')).toBe(true);
    expect(ctx.calls.some(c => c[0] === 'fill')).toBe(true);
  });

  it('returns null with no canvas so the caller can fall back to text', () => {
    expect(drawShareCard(null, {})).toBeNull();
  });
});

// A trend is a shape over time, not a scoreline. Routing its points
// through drawShareCard as `scores` summed a season into a nonsense
// "9825 series" and drew 50 games 220px apart -- ~11,000px on a 1080px
// card, which rendered as a black bar.
describe('trend share card', () => {
  function fakeCtx() {
    const calls = [];
    return { calls,
      fillRect() { calls.push(['rect']); },
      fillText(t) { calls.push(['text', String(t)]); },
      beginPath() { calls.push(['path']); }, moveTo() {}, lineTo() {}, closePath() {},
      fill() { calls.push(['fill']); }, stroke() { calls.push(['stroke']); }, arc() { calls.push(['arc']); },
      set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
      set lineCap(v) {}, set lineJoin(v) {}, set font(v) {}, set textBaseline(v) {}, set globalAlpha(v) {},
    };
  }
  const fifty = Array.from({ length: 50 }, (_, i) => ({ value: 180 + ((i * 7) % 45) }));

  it('draws high, average and low — not a series total', () => {
    const ctx = fakeCtx();
    drawTrendCard(ctx, { bowler: 'Ryan', label: 'Average', points: fifty });
    const texts = ctx.calls.filter(c => c[0] === 'text').map(c => c[1]);
    expect(texts).toContain('High');
    expect(texts).toContain('Average');
    expect(texts).toContain('Low');
    // The bug: 50 games summed to 9825.
    expect(texts).not.toContain('9825');
  });

  it('draws one continuous line rather than 50 separate labels', () => {
    const ctx = fakeCtx();
    drawTrendCard(ctx, { label: 'Average', points: fifty });
    const texts = ctx.calls.filter(c => c[0] === 'text').map(c => c[1]);
    expect(texts.filter(t => t.startsWith('Game ')).length).toBe(0);
    expect(ctx.calls.filter(c => c[0] === 'stroke').length).toBeGreaterThan(0);
  });

  // At 50 points dots merge into a caterpillar; below 20 they aid reading.
  it('omits point dots on a long series', () => {
    const many = fakeCtx(); drawTrendCard(many, { points: fifty });
    const few = fakeCtx(); drawTrendCard(few, { points: fifty.slice(0, 8) });
    expect(few.calls.filter(c => c[0] === 'arc').length)
      .toBeGreaterThan(many.calls.filter(c => c[0] === 'arc').length);
  });

  it('survives an empty or single-point series', () => {
    expect(drawTrendCard(fakeCtx(), { points: [] })).toBe(true);
    expect(drawTrendCard(fakeCtx(), { points: [{ value: 200 }] })).toBe(true);
  });

  it('text names high, low and average without a total', () => {
    const t = trendShareText({ bowler: 'Ryan', label: 'Average', points: fifty });
    expect(t).toContain('high');
    expect(t).toContain('low');
    expect(t).not.toContain('9825');
  });
});

// The trend card was missing the url -- mark and name were drawn, but a
// screenshot said what app made it, not where to get it.
describe('trend card attribution', () => {
  function fakeCtx() {
    const calls = [];
    return { calls,
      fillRect() {}, fillText(t) { calls.push(String(t)); },
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {},
      set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
      set lineCap(v) {}, set lineJoin(v) {}, set font(v) {}, set textBaseline(v) {}, set globalAlpha(v) {},
    };
  }
  it('draws the app name AND the url, matching the score card', () => {
    const ctx = fakeCtx();
    drawTrendCard(ctx, { label: 'Average', points: [{ value: 200 }, { value: 210 }] });
    expect(ctx.calls).toContain(APP_NAME);
    expect(ctx.calls.some(t => APP_URL.includes(t) && t.length > 5)).toBe(true);
  });
});

describe('share QR code', () => {
  it('draws the app url as a scannable code when a generator is available', async () => {
    const calls = [];
    const ctx = { fillRect() { calls.push('rect'); }, drawImage() { calls.push('image'); }, set fillStyle(v) {} };
    global.Image = class { set src(v) { this.onload?.(); } };
    const QRCode = { toDataURL: async () => 'data:image/png;base64,x' };
    const ok = await drawShareQr(ctx, 10, 10, 100, QRCode);
    expect(ok).toBe(true);
    expect(calls).toContain('image');
  });

  it('fails quietly with no generator, rather than throwing', async () => {
    expect(await drawShareQr({}, 0, 0, 100, null)).toBe(false);
  });

  it('fails quietly when generation itself throws', async () => {
    const QRCode = { toDataURL: async () => { throw new Error('offline'); } };
    expect(await drawShareQr({ fillRect(){}, set fillStyle(v){} }, 0, 0, 100, QRCode)).toBe(false);
  });
});
