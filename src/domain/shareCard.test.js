import { describe, it, expect } from 'vitest';
import { shareText, shareTitle, drawShareCard, APP_URL } from './shareCard.js';
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

  // The lane: 39 boards, so 39 rects (plus the background).
  it('draws a real 39-board lane, not a decorative stripe', () => {
    const ctx = fakeCtx();
    drawShareCard(ctx, { scores: [200] });
    expect(ctx.calls.filter(c => c[0] === 'rect').length).toBe(40);
  });

  it('returns null with no canvas so the caller can fall back to text', () => {
    expect(drawShareCard(null, {})).toBeNull();
  });
});
