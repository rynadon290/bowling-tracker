// Checking what the AI said against what it was given.
//
// Both AI features are careful about their INPUT: insights withholds any
// statistic whose sample is too thin, and Brooklyn is sent the same
// gated figures. Neither checked its OUTPUT.
//
// That leaves the one failure that costs trust fastest: the app refuses
// to show a bowler their split conversion because they have thrown
// eleven splits, and then an AI answer confidently discusses their split
// conversion. Now two parts of the same app disagree, and the bowler has
// no way to know which to believe. Worse, they will usually believe the
// sentence over the empty card.
//
// This cannot catch every hallucination. It catches the specific,
// detectable, high-cost one: citing a metric that was deliberately
// withheld. Precision matters more than recall -- a false positive
// suppresses a good answer, so every pattern here has to be a phrase
// that could only mean the metric it maps to.

// Phrases that mean a metric is being discussed.
//
// Deliberately narrow. "Spare" alone appears in almost any bowling
// sentence; "spare conversion" and "spare percentage" are claims about
// the statistic.
const METRIC_PHRASES = {
  strikeRate: [/strike (rate|percentage|pct)/i, /carry (rate|percentage)/i],
  spareConversion: [/spare (conversion|rate|percentage|pct)/i],
  tenPinRate: [/ten[- ]?pin (conversion|rate|percentage)/i, /10[- ]?pin (conversion|rate|percentage)/i],
  splitRate: [/split (conversion|rate|percentage)/i],
  singlePinRate: [/single[- ]?pin (conversion|rate|percentage)/i],
  cornerPinRate: [/corner[- ]?pin (conversion|rate|percentage)/i],
  openFramesPerGame: [/open frames? per game/i, /open frame (rate|percentage)/i],
  averageByPosition: [/(first|second|third) game average/i, /average by (game|position)/i, /fade across/i],
  scoreSpread: [/score (spread|consistency|variance)/i, /how (consistent|steady)/i],
  mostCommonLeave: [/most common leave/i, /leave most often/i],
};

// Metrics that were withheld and are nonetheless discussed.
//
// `withheld` is the array buildAnalysisPayload returns: [{ key, ... }].
// Ball and drill keys look like "ball:Phaze II" and "drill:10pin"; those
// are handled by name rather than by phrase, since the name IS the
// giveaway.
export function citedWithheldMetrics(text, withheld) {
  const body = typeof text === "string" ? text : "";
  if (!body.trim()) return [];

  const keys = (Array.isArray(withheld) ? withheld : [])
    .filter(w => w && typeof w === "object" && typeof w.key === "string")
    .map(w => w.key);

  const cited = [];

  for (const key of keys) {
    // A withheld BALL or DRILL: naming it at all is the problem, because
    // the only reason to name it is to say something about it.
    if (key.startsWith("ball:") || key.startsWith("drill:")) {
      const name = key.slice(key.indexOf(":") + 1).trim();
      // Two characters or fewer would match half the alphabet.
      if (name.length > 2 && new RegExp(escapeRegex(name), "i").test(body)) {
        cited.push(key);
      }
      continue;
    }
    const patterns = METRIC_PHRASES[key];
    if (!patterns) continue;
    if (patterns.some(re => re.test(body))) cited.push(key);
  }

  return cited;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Did the model discuss something it was never told?
//
// Softer than the withheld check and used only for logging: a metric
// nobody sent and nobody withheld is one the model brought with it.
export function citedUnknownMetrics(text, included, withheld) {
  const body = typeof text === "string" ? text : "";
  if (!body.trim()) return [];

  const known = new Set([
    ...Object.keys(included && typeof included === "object" ? included : {}),
    ...(Array.isArray(withheld) ? withheld : [])
      .filter(w => w && typeof w.key === "string").map(w => w.key),
  ]);

  return Object.keys(METRIC_PHRASES)
    .filter(key => !known.has(key))
    .filter(key => METRIC_PHRASES[key].some(re => re.test(body)));
}

// What to do about it.
//
// NOT silent suppression. An answer that vanishes is worse than one with
// a caveat -- the bowler asked a question and got nothing, with no idea
// why. Flagging keeps the answer and warns that part of it outran the
// data, which is both honest and more useful than a blank.
export function reviewAiOutput(text, payload) {
  const p = (payload && typeof payload === "object") ? payload : {};
  const withheld = citedWithheldMetrics(text, p.withheld);
  const unknown = citedUnknownMetrics(text, p.included, p.withheld);

  return {
    text: typeof text === "string" ? text : "",
    citedWithheld: withheld,
    citedUnknown: unknown,
    // One flag for the UI: something in here is talking about data the
    // app does not consider solid.
    overreached: withheld.length > 0,
  };
}

// The line shown when it did.
//
// Names the metric rather than hedging generally, because "some of this
// may be unreliable" makes the whole answer suspect while "it mentioned
// your split conversion, which you haven't thrown enough splits for"
// tells the bowler exactly which sentence to discount.
export function overreachNote(citedWithheld) {
  // Strings only. Array.isArray says the container is a list and nothing
  // about what is in it -- [null] and [42] both reached key.startsWith
  // and threw. The fuzz caught it; my own junk test checked
  // overreachNote(null) and not overreachNote([null]), which is the same
  // blind spot that has cost this codebase a dozen crashes.
  const list = (Array.isArray(citedWithheld) ? citedWithheld : [])
    .filter(k => typeof k === "string" && k);
  if (!list.length) return "";


  const label = key => {
    if (key.startsWith("ball:")) return `your ${key.slice(5)}`;
    if (key.startsWith("drill:")) return `your ${key.slice(6)} drill`;
    return ({
      strikeRate: "strike rate",
      spareConversion: "spare conversion",
      tenPinRate: "ten pin conversion",
      splitRate: "split conversion",
      singlePinRate: "single-pin conversion",
      cornerPinRate: "corner-pin conversion",
      openFramesPerGame: "open frames per game",
      averageByPosition: "average by game",
      scoreSpread: "score spread",
      mostCommonLeave: "most common leave",
    })[key] || key;
  };

  const names = list.map(label);
  const joined = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return `Mentions ${joined}, which you haven't logged enough of yet — treat that part as a guess.`;
}
