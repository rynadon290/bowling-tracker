import { describe, it, expect } from 'vitest';
import { THEMES, THEME_IDS, DEFAULT_THEME, themeFor, normalizeThemeId, themeIsComplete, THEME_TOKENS } from './themes.js';

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

  it('every theme is dark-ground', () => {
    for (const id of THEME_IDS) {
      const bg = THEMES[id].colors.bg;
      const lum = ['1', '3', '5'].map(i => parseInt(bg.slice(+i, +i + 2), 16)).reduce((a, b) => a + b, 0) / 3;
      expect(lum).toBeLessThan(40);
    }
  });
});
