// Colour themes.
//
// Every palette here answers the same question: what does the app look
// like at a real bowling centre? Some centres are dim with the lane the
// one bright thing in the room; plenty are fluorescent-bright all day;
// and a scoresheet is paper. So the set spans dark and light -- they
// differ in WHICH part of the house they take their colour from, not in
// whether they look like bowling.
//
// Light themes need darker accents than dark themes do. An amber that
// glows on near-black is unreadable on cream, and the primary button
// draws white text on the accent, so the accent itself has to carry
// enough contrast against white. The contrast test in themes.test.js
// enforces this for every theme rather than trusting eyeballs.
//
// Each theme supplies the same token set, so components never need to
// know which one is active. Semantic colours (strike / spare / miss) are
// kept close across themes on purpose: a strike being green is something
// a bowler learns once and should not have to relearn per theme.

export const THEMES = {
  // Lane maple at night. The default -- warm darks, with the amber of the
  // arrow inlays and pin-deck lighting as the accent.
  lane: {
    id: "lane",
    label: "Lane",
    hint: "Maple and amber, like the house lights are down",
    colors: {
      bg: "#14110E", surface: "#1C1813", card: "#26201A",
      accent: "#E8A33D", accentDim: "#3D2E15",
      onAccent: "#1A1206",
      compare: "#7FB8D9",
      strike: "#5FBF7F", spare: "#E8A33D", miss: "#D9564B",
      text: "#F4F0E6", textMuted: "#9A8F80", border: "#332B22",
    },
  },

  // The original slate-and-blue. Kept as a real option, not a legacy
  // fallback: some bowlers will prefer the cooler read, and anyone who
  // has used the app until now shouldn't have the ground move under them
  // without a way back.
  classic: {
    id: "classic",
    label: "Classic",
    hint: "Slate and blue, the original look",
    colors: {
      bg: "#0f1117", surface: "#1a1d27", card: "#22263a",
      accent: "#4a9eff", accentDim: "#1e3a5f",
      onAccent: "#0B1626",
      compare: "#f59e0b",
      strike: "#22c55e", spare: "#f59e0b", miss: "#ef4444",
      text: "#e8eaf0", textMuted: "#8892a4", border: "#2e3347",
    },
  },

  // Rock'n'bowl. The greens and teals of a blacklit house on a Friday
  // night, cooler than Lane but still warm-black underneath.
  //
  // Keeps the id "pattern" -- it's stored in every existing preferences
  // row, and renaming it would reset everyone's theme to the default.
  pattern: {
    id: "pattern",
    label: "Glow",
    hint: "Rock'n'bowl green on warm black",
    colors: {
      bg: "#0F1412", surface: "#161D19", card: "#1E2822",
      accent: "#4FC9A4", accentDim: "#153A2E",
      onAccent: "#07201A",
      compare: "#E8B94D",
      strike: "#5FBF7F", spare: "#E8B94D", miss: "#D9564B",
      text: "#EAF2EC", textMuted: "#8FA398", border: "#2A3A32",
    },
  },

  // Urethane. The deep plum-and-pink of a classic urethane ball, for
  // anyone who wants the app to look like their favourite piece of
  // equipment.
  urethane: {
    id: "urethane",
    label: "Urethane",
    hint: "Deep plum with a pink flash",
    colors: {
      bg: "#140F16", surface: "#1C1520", card: "#271D2C",
      accent: "#E874A6", accentDim: "#3F1F30",
      onAccent: "#2A0F1C",
      compare: "#7FC8B0",
      strike: "#5FBF7F", spare: "#E8A33D", miss: "#E05A5A",
      text: "#F3ECF2", textMuted: "#A08FA0", border: "#362A39",
    },
  },

  // Pin deck. High contrast: near-white text on true black, with the red
  // stripe of a pin as the accent. For a bright house, or for anyone who
  // finds the warm themes too soft.
  pindeck: {
    id: "pindeck",
    label: "Pin deck",
    hint: "High contrast, red pin stripe",
    colors: {
      bg: "#0A0A0A", surface: "#141414", card: "#1E1E1E",
      // Deepened from #E5484D: that shade only gave white text 3.9:1.
      accent: "#D63A40", accentDim: "#3E1418",
      onAccent: "#FFFFFF",
      compare: "#7FB8D9",
      strike: "#5FBF7F", spare: "#E8B94D", miss: "#E5484D",
      text: "#FAFAFA", textMuted: "#9A9A9A", border: "#2E2E2E",
    },
  },
};

// ── Light ──────────────────────────────────────────────────────────────

Object.assign(THEMES, {
  // A bright modern centre. Off-white ground, maple wood as the accent,
  // the deep-stained kind rather than raw blonde so it reads on white.
  daylight: {
    id: "daylight",
    label: "Daylight",
    hint: "Bright house, maple accents",
    light: true,
    colors: {
      bg: "#F6F3EE", surface: "#FFFFFF", card: "#FBF9F5",
      accent: "#9A5B14", accentDim: "#F3E4CD",
      onAccent: "#FFFFFF",
      compare: "#2B5797",
      strike: "#1E7A44", spare: "#A5620F", miss: "#B8322C",
      text: "#1C1712", textMuted: "#6E655B", border: "#E2DBD0",
    },
  },

  // A printed league scoresheet: cream paper, the blue of the ruled
  // lines and the red of a marked split. The most literally-bowling
  // palette here, and the one that looks like the thing on the desk.
  scoresheet: {
    id: "scoresheet",
    label: "Scoresheet",
    hint: "Cream paper, ruled-line blue and split red",
    light: true,
    colors: {
      bg: "#F4EFE2", surface: "#FBF8F0", card: "#FFFDF7",
      accent: "#2B5797", accentDim: "#DCE5F3",
      onAccent: "#FFFFFF",
      compare: "#B8322C",
      strike: "#1E7A44", spare: "#9A6A0E", miss: "#B8322C",
      text: "#1E1B15", textMuted: "#6B655A", border: "#DED6C3",
    },
  },

  // Plain and cool. For anyone who wants the app to disappear and just
  // be readable in a bright room.
  chalk: {
    id: "chalk",
    label: "Chalk",
    hint: "Cool white, quiet blue",
    light: true,
    colors: {
      bg: "#F3F5F8", surface: "#FFFFFF", card: "#FAFBFD",
      accent: "#2457B0", accentDim: "#DCE6F7",
      onAccent: "#FFFFFF",
      compare: "#A5620F",
      strike: "#1E7A44", spare: "#A5620F", miss: "#B8322C",
      text: "#141A24", textMuted: "#5F6B7A", border: "#DCE2EA",
    },
  },
});

export const THEME_IDS = Object.keys(THEMES);
export const DARK_THEME_IDS = THEME_IDS.filter(id => !THEMES[id].light);
export const LIGHT_THEME_IDS = THEME_IDS.filter(id => THEMES[id].light);
export const DEFAULT_THEME = "pattern";

export function themeFor(id) {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}

// Anything stored that isn't a known theme falls back to the default,
// so a removed or renamed theme can't leave the app with no colours.
export function normalizeThemeId(id) {
  return THEME_IDS.includes(id) ? id : DEFAULT_THEME;
}

// Every theme must define every token. A missing key would be undefined
// in an inline style -- which React silently drops -- so a component
// would render with no background rather than crashing, and nobody would
// notice until it looked wrong on one theme only.
export const THEME_TOKENS = [
  "bg", "surface", "card", "accent", "accentDim",
  // Text drawn ON the accent -- the primary button, count badges. Bright
  // accents (amber, sky blue) need dark text; deep accents need white.
  // Hardcoding white here was the original app's one real accessibility
  // failure: Classic's blue only manages 2.75:1 under white.
  "onAccent",
  // The second series in any two-bowler chart. Distinct from accent AND
  // from spare on every theme -- on Lane those two are the same amber,
  // which drew both bowlers in a head-to-head chart in one colour.
  "compare",
  "strike", "spare", "miss", "text", "textMuted", "border",
];

export function themeIsComplete(theme) {
  return THEME_TOKENS.every(k => typeof theme?.colors?.[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(theme.colors[k]));
}
