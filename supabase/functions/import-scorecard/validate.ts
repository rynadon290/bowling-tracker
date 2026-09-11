// Server-side validation of Gemini's scorecard extraction.
//
// Until this existed, index.ts did `JSON.parse(text)` and returned the
// result. Anything that parsed was accepted, so `frameNumber: 47` and
// `totalScore: 987` passed straight into bowling records. The
// responseSchema describes valid ranges to Gemini in prose -- "1 through
// 10", "Pin numbers 1-10" -- but prose in a prompt is a request, not a
// constraint, and nothing checked the answer on the way back.
//
// Deliberately a separate file with no Deno globals and no imports, so it
// can be exercised by qa_import_validation.sh in Node. Deno is not
// installed in the QA container, and a validator that can only be tested
// by deploying it is a validator nobody tests.
//
// ── Three rules this follows ────────────────────────────────────────────
//
// 1. THE SCORES-ONLY IMPORT MUST SURVIVE. Plenty of scorecards show game
//    totals and no pin-deck graphics at all; the extraction prompt tells
//    Gemini to return those games with an empty `frames` array, and the
//    app supports them fully. A naive "frames must be non-empty" check
//    would reject a real and common workflow. Empty frames are valid, and
//    so is a game with no `frames` key at all.
//
// 2. EVERY REJECTION MAPS ONTO A STATE THE APP ALREADY HANDLES. An
//    impossible frame is dropped, because a game with missing frames is
//    already the partial-read case the client-side conversion handles
//    ("figures out how many balls SHOULD exist and only trusts what's
//    present"). An impossible score becomes null, because null already
//    means "not shown or not legible" everywhere it appears. Nothing here
//    invents a new failure mode for the client to learn.
//
// 3. NOTHING IS REBUILT FIELD BY FIELD. Games and frames are shallow-
//    copied and only the checked fields are overwritten. HANDOFF 4.3
//    records four separate occasions where a field-by-field rebuild
//    silently dropped whatever nobody remembered to list; a validator
//    that quietly deleted a field added to the schema next month would be
//    the same bug in a new place.
//
// What it does NOT do is verify that a game's frames add up to its
// printed total. That is real arithmetic on data the bowler still
// reviews in the verification inbox before anything is confirmed, and
// a mismatch is more likely to be one misread pin than a fabricated
// game. Rejecting on it would throw away a mostly-good import.

const MAX_GAMES_PER_CARD = 60;      // e.g. 8 bowlers x 6 games, generously
const MAX_GAME_NUMBER = 30;
const MAX_SERIES_TOTAL = 300 * MAX_GAME_NUMBER;
const MAX_LINEUP_POSITION = 11;
const MAX_NAME_LENGTH = 120;

const isInt = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v);
const inRange = (v: unknown, lo: number, hi: number): boolean => isInt(v) && (v as number) >= lo && (v as number) <= hi;
const isObj = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v);

// A pin is "1".."10". Gemini is asked for strings and normally sends
// them, but an integer 1-10 means exactly one thing and coercing it is
// unambiguous. Being strict here would turn a harmless formatting
// difference into a total import failure, which is a worse outcome than
// a recorded repair.
function normalisePin(p: unknown): string | null {
  if (typeof p === "string" && /^([1-9]|10)$/.test(p)) return p;
  if (inRange(p, 1, 10)) return String(p);
  return null;
}

export function validateExtraction(parsed: unknown) {
  const dropped = { games: 0, frames: 0 };
  const nulled = { totalScore: 0, seriesTotal: 0, lineupPosition: 0, bowlerName: 0, ballUsed: 0 };
  const repaired = { pins: 0 };

  const rawGames = isObj(parsed) && Array.isArray((parsed as any).games) ? (parsed as any).games : [];
  const games: any[] = [];

  for (const rawGame of rawGames.slice(0, MAX_GAMES_PER_CARD)) {
    // gameNumber is the one field with no null fallback -- it is required
    // by the schema and the client groups on it. A game without a usable
    // one cannot be placed, so it goes rather than being guessed at.
    if (!isObj(rawGame) || !inRange((rawGame as any).gameNumber, 1, MAX_GAME_NUMBER)) {
      dropped.games++;
      continue;
    }

    const game: any = { ...(rawGame as any) };

    // Optional fields: out of range or wrong type becomes null, which is
    // already what "not shown or not legible" looks like everywhere else.
    if (game.totalScore !== undefined && game.totalScore !== null && !inRange(game.totalScore, 0, 300)) {
      game.totalScore = null; nulled.totalScore++;
    }
    if (game.seriesTotal !== undefined && game.seriesTotal !== null && !inRange(game.seriesTotal, 0, MAX_SERIES_TOTAL)) {
      game.seriesTotal = null; nulled.seriesTotal++;
    }
    if (game.lineupPosition !== undefined && game.lineupPosition !== null && !inRange(game.lineupPosition, 0, MAX_LINEUP_POSITION)) {
      game.lineupPosition = null; nulled.lineupPosition++;
    }
    if (game.bowlerName !== undefined && game.bowlerName !== null
        && (typeof game.bowlerName !== "string" || game.bowlerName.length > MAX_NAME_LENGTH)) {
      game.bowlerName = null; nulled.bowlerName++;
    }
    if (game.ballUsed !== undefined && game.ballUsed !== null
        && (typeof game.ballUsed !== "string" || game.ballUsed.length > MAX_NAME_LENGTH)) {
      game.ballUsed = null; nulled.ballUsed++;
    }

    // Absent `frames` stays absent. Adding an empty array would be a
    // change to the payload shape for no reason, and the client already
    // copes with the key being missing.
    if (game.frames !== undefined) {
      if (!Array.isArray(game.frames)) {
        dropped.frames++;
        game.frames = [];
      } else {
        const seen = new Set<number>();
        const keep: any[] = [];
        for (const frame of game.frames) {
          const verdict = checkFrame(frame, seen, repaired);
          if (verdict === null) { dropped.frames++; continue; }
          seen.add(verdict.frameNumber);
          keep.push(verdict);
        }
        game.frames = keep;
      }
    }

    games.push(game);
  }

  // Anything beyond the cap is counted rather than ignored, so a payload
  // that was truncated says so.
  if (rawGames.length > MAX_GAMES_PER_CARD) dropped.games += rawGames.length - MAX_GAMES_PER_CARD;

  return { games, dropped, nulled, repaired };
}

// Returns the frame to keep (the original object when nothing needed
// repairing, so a clean extraction passes through byte-identical), or
// null to drop it.
function checkFrame(frame: unknown, seen: Set<number>, repaired: { pins: number }) {
  if (!isObj(frame)) return null;
  const f = frame as any;
  if (!inRange(f.frameNumber, 1, 10)) return null;
  if (seen.has(f.frameNumber)) return null;          // a repeated frame is a misread, not two frames
  if (!Array.isArray(f.balls)) return null;

  // Frames 1-9 hold at most two deliveries. The tenth holds three, and
  // only when a strike or spare earns the extra ball -- but which of
  // those applies is the client-side conversion's job, so the check here
  // is the physical ceiling, not the scoring rule.
  const maxBalls = f.frameNumber === 10 ? 3 : 2;
  // A frame with no deliveries carries nothing and is indistinguishable
  // from the frame being absent -- which is the shape the prompt actually
  // asks for when there is no per-frame detail.
  if (f.balls.length < 1 || f.balls.length > maxBalls) return null;

  let changed = false;
  const balls: any[] = [];
  // Each delivery is numbered, once, in order.
  //
  // ballIndex was only range-checked, so a frame could arrive as
  // [ball 1, ball 1] and pass -- two readings of the same delivery,
  // or one delivery duplicated by a model that saw the same box
  // twice. Downstream that becomes two shots for one throw, which
  // inflates shot count, strike rate and spare percentage without
  // ever looking wrong.
  //
  // Order matters too: [ball 2, ball 1] means the reading is
  // scrambled, and a frame whose deliveries are out of sequence
  // cannot be scored -- the second ball's pin count is derived from
  // what the first left standing.
  //
  // Rejected rather than repaired. Renumbering guesses which
  // reading was right, and a wrong guess is a wrong score filed
  // silently; a rejected frame surfaces for confirmation.
  const seenIndexes: number[] = [];
  for (const rawBall of f.balls) {
    if (!isObj(rawBall)) return null;
    const b = rawBall as any;
    if (!inRange(b.ballIndex, 1, maxBalls)) return null;
    if (seenIndexes.includes(b.ballIndex)) return null;      // the same delivery twice
    if (seenIndexes.length && b.ballIndex <= seenIndexes[seenIndexes.length - 1]) return null;  // out of order
    seenIndexes.push(b.ballIndex);
    if (typeof b.isStrike !== "boolean") return null;
    if (!Array.isArray(b.pinsStanding) || b.pinsStanding.length > 10) return null;

    const pins: string[] = [];
    for (const p of b.pinsStanding) {
      const pin = normalisePin(p);
      if (pin === null) return null;
      if (pins.includes(pin)) return null;           // the same pin cannot stand twice
      if (pin !== p) { changed = true; repaired.pins++; }
      pins.push(pin);
    }
    // A strike means every pin went down. Pins standing after one is a
    // contradiction in the reading, not a rare event.
    if (b.isStrike && pins.length > 0) return null;

    balls.push(changed ? { ...b, pinsStanding: pins } : b);
  }

  return changed ? { ...f, balls } : f;
}
