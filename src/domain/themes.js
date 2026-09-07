// Colour themes.
//
// Every palette here answers the same question: what does the app look
// like at a real bowling centre? A centre is dark, with the lane itself
// the one bright, warm thing in it. So every theme is dark-ground with
// one lane-derived accent -- they differ in WHICH part of the house they
// take their colour from, not in whether they look like bowling.
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
      strike: "#22c55e", spare: "#f59e0b", miss: "#ef4444",
      text: "#e8eaf0", textMuted: "#8892a4", border: "#2e3347",
    },
  },

  // Oil pattern. The greens and teals of a lane-machine readout, cooler
  // than Lane but still warm-black underneath.
  pattern: {
    id: "pattern",
    label: "Pattern",
    hint: "Oil-machine green on warm black",
    colors: {
      bg: "#0F1412", surface: "#161D19", card: "#1E2822",
      accent: "#4FC9A4", accentDim: "#153A2E",
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
      accent: "#E5484D", accentDim: "#3E1418",
      strike: "#5FBF7F", spare: "#E8B94D", miss: "#E5484D",
      text: "#FAFAFA", textMuted: "#9A9A9A", border: "#2E2E2E",
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = "lane";

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
  "strike", "spare", "miss", "text", "textMuted", "border",
];

export function themeIsComplete(theme) {
  return THEME_TOKENS.every(k => typeof theme?.colors?.[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(theme.colors[k]));
}
