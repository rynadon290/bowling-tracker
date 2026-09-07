import { describe, it, expect } from 'vitest';
import { THEMES, THEME_IDS, DEFAULT_THEME, themeFor, normalizeThemeId, themeIsComplete, THEME_TOKENS, DARK_THEME_IDS, LIGHT_THEME_IDS } from './themes.js';

// WCAG relative luminance and contrast ratio.
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('themes', () => {
  // A missing token becomes `undefined` in an inline style, which React
  // silently drops -- so a component renders with no background on one
  // theme only, and nobody notices until it looks wrong.
  it('every theme defines every token as a hex colour', () => {
    for (const id of THEME_IDS) expect(themeIsComplete(THEMES[id])).toBe(true);
  });

  it('has a default that exists', () => {
    expect(THEME_IDS).toContain(DEFAULT_THEME);
  });

  // A removed or renamed theme in a stored preference must not leave the
  // app with no colours.
  it('falls back to the default for an unknown id', () => {
    expect(normalizeThemeId('neon')).toBe(DEFAULT_THEME);
    expect(themeFor('neon').id).toBe(DEFAULT_THEME);
  });

  // A strike being green is learned once; it should not change per theme.
  it('keeps the semantic outcome colours close across themes', () => {
    for (const id of THEME_IDS) {
      const c = THEMES[id].colors;
      expect(c.strike).toMatch(/^#[0-9a-fA-F]{6}$/);
      // green-ish: G channel dominates
      const g = parseInt(c.strike.slice(3, 5), 16), r = parseInt(c.strike.slice(1, 3), 16);
      expect(g).toBeGreaterThan(r);
    }
  });

  it('keeps the original palette available as Classic', () => {
    expect(THEMES.classic.colors.accent).toBe('#4a9eff');
  });

  // Replaced an earlier "every theme is dark" assertion, which was my
  // assumption about bowling centres rather than a requirement -- plenty
  // are fluorescent-bright. What actually has to hold, on every theme,
  // is that the text can be read.
  it('body text is readable on every theme (WCAG AA, 4.5:1)', () => {
    for (const id of THEME_IDS) {
      const c = THEMES[id].colors;
      expect(contrast(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.text, c.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('muted text still meets the large-text bar (3:1) everywhere', () => {
    for (const id of THEME_IDS) {
      const c = THEMES[id].colors;
      expect(contrast(c.textMuted, c.card)).toBeGreaterThanOrEqual(3);
    }
  });

  // The primary button draws onAccent on the accent. This is the check
  // that found the original app's white-on-blue button at 2.75:1 -- and
  // is why onAccent is a per-theme token rather than hardcoded white.
  it('the primary button text is readable on every accent', () => {
    for (const id of THEME_IDS) {
      const c = THEMES[id].colors;
      expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Outcome colours are drawn as text on the card. Green-on-cream is the
  // classic failure here.
  it('strike, spare and miss are readable as text on every card', () => {
    for (const id of THEME_IDS) {
      const c = THEMES[id].colors;
      for (const k of ['strike', 'spare', 'miss']) {
        expect(contrast(c[k], c.card)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('offers both dark and light options', () => {
    expect(DARK_THEME_IDS.length).toBeGreaterThanOrEqual(3);
    expect(LIGHT_THEME_IDS.length).toBeGreaterThanOrEqual(2);
  });

  it('the light flag matches the actual background', () => {
    for (const id of THEME_IDS) {
      const isLight = lum(THEMES[id].colors.bg) > 0.5;
      expect(!!THEMES[id].light).toBe(isLight);
    }
  });
});

describe('comparison colour', () => {
  // The bug: on Lane, accent and spare were the same amber, so a
  // head-to-head chart drew both bowlers identically.
  // Luminance contrast is the wrong measure here -- teal and yellow can
  // have the same luminance and still be obviously different. Colour
  // distance in RGB is what "these are two different bowlers" needs.
  it('is distinct from the accent on every theme', () => {
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    for (const id of THEME_IDS) {
      const c = THEMES[id].colors;
      expect(dist(c.compare, c.accent)).toBeGreaterThan(80);
    }
  });
  it('is readable on the card', () => {
    for (const id of THEME_IDS) expect(contrast(THEMES[id].colors.compare, THEMES[id].colors.card)).toBeGreaterThanOrEqual(3);
  });
});
