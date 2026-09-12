// The bowling genie: what counts as a question, and how many are left.
//
// Three questions a day, and the genie only answers about bowling.
//
// THE CLASSIFIER IS DELIBERATELY PERMISSIVE.
//
// A wrongly-refused question costs the bowler a third of their day. A
// wrongly-allowed one costs about half a cent. Those are not the same
// mistake, so this catches only the obviously-off and lets everything
// ambiguous through to Gemini, which can actually judge intent.
//
// An allowlist of bowling words would be worse than useless here. "Why
// does that keep happening?", "what should I change?", "am I getting
// better?" are all plainly bowling questions to a genie holding your
// history, and not one of them contains a bowling word.
//
// WHAT COUNTS AGAINST THE THREE:
//
//   Gemini answers            -> counts. You got your answer.
//   Gemini refuses in character -> counts. It read the question and
//                                 made a judgement; that is a wish spent.
//   This classifier blocks    -> does NOT count. Nothing was spent, and
//                                 the user may just be phrasing something
//                                 oddly. Burning a wish on a regex being
//                                 wrong is what they would remember.

export const DAILY_QUESTIONS = 3;

// Obvious other domains. Each one is a thing people genuinely ask an
// assistant, and none of them is a bowling question by any reading.
const OTHER_DOMAINS = [
  /\b(recipe|cook|bake|ingredient)\b/i,
  /\b(weather|forecast|temperature outside)\b/i,
  /\b(stock|crypto|bitcoin|invest|portfolio)\b/i,
  /\b(symptom|diagnos|prescription|medication|dosage)\b/i,
  /\b(president|election|senator|political party|vote for)\b/i,
  /\b(homework|essay|thesis|assignment)\b/i,
  /\b(translate|in spanish|in french|in german)\b/i,
  /\b(directions to|how do i get to|nearest gas)\b/i,
  /\bwrite (me )?(a|an|my) (poem|song|story|essay|email|letter|code)\b/i,
  /\b(javascript|python|sql|regex|function that)\b/i,
];

// Attempts to make the genie something else entirely. Not a bowling
// question, and not worth a paid call.
const NOT_A_QUESTION = [
  /\b(ignore|disregard) (all |your |the )?(previous |prior |above )?(instructions|rules|prompt)/i,
  /\byou are (now|actually) (a|an)\b/i,
  /\bpretend (you are|to be)\b/i,
  /\bsystem prompt\b/i,
];

// Is this worth spending a call on?
//
// Returns { ok } when it should go to Gemini, or { ok: false, reason }
// when the genie should decline for free.
export function classifyQuestion(text) {
  const q = typeof text === "string" ? text.trim() : "";

  if (!q) return { ok: false, reason: "empty" };
  // One word is never a question worth a paid call, and is usually a
  // mis-tap.
  if (q.split(/\s+/).length < 2) return { ok: false, reason: "too-short" };
  if (q.length > 500) return { ok: false, reason: "too-long" };

  for (const re of NOT_A_QUESTION) if (re.test(q)) return { ok: false, reason: "off-topic" };
  for (const re of OTHER_DOMAINS) if (re.test(q)) return { ok: false, reason: "off-topic" };

  return { ok: true };
}

// What the genie says when it declines for free. In character, and clear
// that it cost nothing -- otherwise people assume it did.
// The genie has a name, and uses it.
//
// Brooklyn is a crossover strike -- the ball comes in on the wrong side
// and works anyway. It is also a real name, which is the point: a genie
// that says "Brooklyn only knows bowling" is a character, and one that
// says "I only know bowling" is a validation message.
//
// Exported so the panel, the refusals and the Edge Function's system
// prompt all read from one place. Three copies of a name is how a
// character ends up called two different things on the same screen.
export const GENIE_NAME = "Brooklyn";

export function refusalMessage(reason) {

  switch (reason) {

    case "empty":

    case "too-short":

      return `Ask ${GENIE_NAME} something. She's got your whole history in here.`;

    case "too-long":

      return `That's a lot. Try asking ${GENIE_NAME} one thing.`;

    default:

      return `${GENIE_NAME} only knows bowling. That one's free — ask her something else.`;

  }

}

// ── The daily budget ────────────────────────────────────────────────────
//
// Counted per calendar day in the bowler's own timezone, because "today"
// means their today. The authoritative count is server-side; this mirrors
// it so the UI can show what is left without a round trip.

export function questionsUsedToday(asked, today) {
  const day = typeof today === "string" && today ? today : "";
  return (Array.isArray(asked) ? asked : [])
    .filter(a => a && typeof a === "object" && a.date === day && a.counted !== false)
    .length;
}

export function questionsLeftToday(asked, today) {
  return Math.max(0, DAILY_QUESTIONS - questionsUsedToday(asked, today));
}

export function canAskToday(asked, today) {
  return questionsLeftToday(asked, today) > 0;
}

// "2 wishes left today" / "Back tomorrow".
export function budgetLabel(asked, today) {
  const left = questionsLeftToday(asked, today);
  if (left === 0) return "Back tomorrow";
  return `${left} ${left === 1 ? "wish" : "wishes"} left today`;
}

// ── What Gemini is told ─────────────────────────────────────────────────

// The genie sees a SUMMARY, not the raw history.
//
// Three seasons of real data is about 2.26MB -- roughly 600k tokens, and
// about $0.45 per question at Flash rates. The same question answered
// from a few thousand tokens of computed stats costs under a cent, and
// the answer is better: the model reasons about figures rather than
// counting rows.
export function buildGenieContext(summary) {
  const s = (summary && typeof summary === "object") ? summary : {};
  const lines = [];
  const add = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    lines.push(`${label}: ${value}`);
  };

  // The bowler's own name and their team's.
  //
  // Their own name is their own data, and they invoked this themselves.
  // A team name is a team, not a person. Neither is another
  // individual's record, which is the line the team aggregates below
  // are drawn to respect.
  //
  // Worth the tokens: a genie that can say "you and the Alley Cats" is
  // answering a bowler, and one that says "the user" is filling in a
  // form.
  add("Bowler", s.bowlerName);
  add("Team", s.teamName);
  add("Average", s.average);

  add("High game", s.highGame);
  add("High series", s.highSeries);
  add("Games logged", s.gamesLogged);
  add("Strike percentage", s.strikePct);
  add("Spare percentage", s.sparePct);
  add("Single-pin spare percentage", s.singlePinPct);
  add("Split conversion percentage", s.splitPct);
  add("Open frames per game", s.opensPerGame);
  add("Corner pin spare percentage", s.cornerPinPct);
  add("Most-used ball", s.topBall);
  add("Balls in the bag", s.arsenal);
  add("Leagues", s.leagues);
  add("Handedness", s.handedness);
  add("Best game by position in the set", s.byPosition);
  add("Times left hung by teammates", s.timesHung);
  add("Times helped hang a teammate", s.hangAssists);

  // TEAM AGGREGATES ONLY. No teammate is named and no individual
  // average leaves the device.
  //
  // A team's high game is a fact about a team you are on. Maggie's
  // average is Maggie's, and sending it to Google so the genie can
  // answer someone else's question is a different thing entirely --
  // even though it would make the answers slightly better.
  add("Team high game", s.teamHighGame);
  add("Team high series", s.teamHighSeries);
  add("Team average game total", s.teamGameAvg);
  add("Team points won this season", s.teamPoints);
  add("Team record", s.teamRecord);

  // Trend and consistency: what the numbers are DOING, not just what
  // they are. A genie told only an average can say what you bowl; told
  // the direction, it can say whether that is going anywhere.
  add("Average over the last five nights", s.recentAverage);
  add("Score spread, lower is steadier", s.scoreConsistency);
  add("Book average", s.bookAverage);
  add("Nights logged", s.nightsLogged);
  add("Most common leave", s.commonLeave);
  add("Ten pin conversion", s.tenPinPct);

  // Per-ball and per-centre, which the analysis had and Brooklyn did
  // not. "Your Zen carries better than the Phaze on this house" is the
  // kind of answer a bowler actually wants, and it needs both.
  add("Strike rate by ball", s.ballRates);
  add("Average by centre", s.centerAverages);

  // Drill conversion. The practice group's richest data, and it reached
  // neither Brooklyn nor the analysis until now -- so a bowler who had
  // thrown 200 ten pins in practice could ask about their ten pin and be
  // answered from league shots alone.
  add("Drill conversion", s.drillRates);

  return lines.join("\n");
}
