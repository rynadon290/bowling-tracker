// Converts the raw, per-ball extraction data returned by the import-scorecard
// Edge Function (see supabase/functions/import-scorecard/index.ts) into this
// app's actual shot records.
//
// The extraction reports simple, raw physical facts -- every ball actually
// thrown, each with its own strike/pins-standing observation. This module
// does the real translation work: grouping those raw deliveries into shots
// the way this app actually stores them, which is NOT a 1:1 mapping,
// especially in the 10th frame. See the frame-10 comments below -- getting
// ballNum assignment wrong here would silently produce wrong scores.

// Converts one frame's raw balls (1-9) into a single shot record. Frames
// 1-9 always map 1:1 -- one shot record per frame, embedding both the
// first ball's leave and (if not a strike) the second ball's spareMade/
// pinCount, exactly like the app's own manual-entry flow produces.
function convertRegularFrame(frame, base) {
  const balls = frame.balls || [];
  const first = balls[0];
  if (!first) return null;

  if (first.isStrike) {
    return { ...base, frame: String(frame.frameNumber), ballNum: null, result: "Strike", otherLeave: [], spareMade: "", pinCount: "" };
  }

  const standingAfterBall1 = first.pinsStanding || [];
  const firstBallCount = 10 - standingAfterBall1.length;
  const second = balls[1];
  if (!second) {
    // Only one ball reported for a non-strike frame -- incomplete/unclear
    // extraction. Leave it for the review step rather than guess.
    return { ...base, frame: String(frame.frameNumber), ballNum: null, result: "Other Leave", otherLeave: standingAfterBall1, spareMade: "", pinCount: "" };
  }

  const madeSpare = (second.pinsStanding || []).length === 0;
  const pinCount = madeSpare
    ? String(firstBallCount) // spare: pinCount holds the FIRST-ball count, matching handleLeaveToggle's own convention -- the app never actually reads pinCount for scoring a spare (it's always 10 + bonus), but stores it this way for consistency with manual entry
    : String(10 - (second.pinsStanding || []).length); // open: pinCount is the TOTAL combined pinfall for both balls, i.e. 10 minus whatever's still standing at frame's end

  return {
    ...base, frame: String(frame.frameNumber), ballNum: null, result: "Other Leave",
    otherLeave: standingAfterBall1, spareMade: madeSpare ? "Yes" : "No", pinCount,
  };
}

// The 10th frame is where this gets genuinely tricky. The app's own shot
// records for frame 10 do NOT map 1:1 to physical balls thrown -- ballNum=2
// specifically means "the fresh-rack delivery right after a ball-1 strike."
// If ball 1 ISN'T a strike (even if it converts into a spare), there is no
// ballNum=2 shot record at all -- the very next ball, if any, is stored as
// ballNum=3 directly. Getting this wrong wouldn't error, it would just
// silently produce a shot record the scoring logic doesn't recognize the
// same way, and the total would come out wrong with no warning.
//
// Every group below is "one fresh-rack attempt, plus its own follow-up
// ball if the first ball of that attempt didn't clear the rack itself."
//
// `warnings` is an array this function pushes onto, flagging shots that
// need mandatory manual verification before saving -- specifically: an
// open ball 1 that converts to a spare, followed by a non-strike bonus
// ball. That bonus ball is thrown on a freshly-reset rack with nothing
// else in the frame to anchor which pins it involved -- confirmed
// unreliable to extract from the scorecard image by direct inspection of
// a real one, not just a theoretical concern.
function convertTenthFrame(frame, base, warnings) {
  const balls = frame.balls || [];
  const shots = [];
  let i = 0;

  // --- Ball 1: always a normal, self-contained attempt (like frames 1-9) ---
  const b1 = balls[i];
  if (!b1) return shots;
  let b1Shot;
  if (b1.isStrike) {
    b1Shot = { ...base, frame: "10", ballNum: 1, result: "Strike", otherLeave: [], spareMade: "", pinCount: "" };
    i += 1;
  } else {
    const standing = b1.pinsStanding || [];
    const b2 = balls[i + 1];
    if (!b2) {
      // Only ball 1 shown and it wasn't a strike -- incomplete for now.
      shots.push({ ...base, frame: "10", ballNum: 1, result: "Other Leave", otherLeave: standing, spareMade: "", pinCount: "" });
      return shots;
    }
    const made = (b2.pinsStanding || []).length === 0;
    const pinCount = made ? String(10 - standing.length) : String(10 - (b2.pinsStanding || []).length);
    b1Shot = { ...base, frame: "10", ballNum: 1, result: "Other Leave", otherLeave: standing, spareMade: made ? "Yes" : "No", pinCount };
    i += 2;
  }
  shots.push(b1Shot);

  const ball1WasStrike = b1.isStrike;
  const ball1MadeSpare = b1Shot.spareMade === "Yes";

  if (!ball1WasStrike && !ball1MadeSpare) {
    // Ball 1 was open and did NOT convert -- the frame (and game) is over.
    // Any further balls the extraction reported here would be a mistake;
    // deliberately ignored rather than guessed into a shape.
    return shots;
  }

  if (ball1WasStrike) {
    // --- ballNum 2 exists specifically because ball 1 struck ---
    const b2 = balls[i];
    if (!b2) return shots; // ball 2 not yet shown/thrown
    let b2Shot;
    if (b2.isStrike) {
      b2Shot = { ...base, frame: "10", ballNum: 2, result: "Strike", otherLeave: [], spareMade: "", pinCount: "" };
      i += 1;
    } else {
      const standing = b2.pinsStanding || [];
      const b3 = balls[i + 1];
      if (!b3) {
        shots.push({ ...base, frame: "10", ballNum: 2, result: "Other Leave", otherLeave: standing, spareMade: "", pinCount: "" });
        return shots;
      }
      // Ball 2's own follow-up (its embedded spare attempt) is this same
      // ballNum=2 record's spareMade/pinCount -- there's no separate
      // ballNum=3 in this specific path, matching the app's own convention
      // exactly ("ball 2 bundles its own spare attempt, frame done in 2
      // balls" -- see nextState in domain/scoring.js).
      const made = (b3.pinsStanding || []).length === 0;
      const pinCount = made ? String(10 - standing.length) : String(10 - (b3.pinsStanding || []).length);
      b2Shot = { ...base, frame: "10", ballNum: 2, result: "Other Leave", otherLeave: standing, spareMade: made ? "Yes" : "No", pinCount };
      i += 2;
    }
    shots.push(b2Shot);

    if (!b2.isStrike) {
      // Ball 2 wasn't a strike -- whether or not it converted, the frame
      // is complete in exactly 2 shot records (ball 2 embeds its own
      // follow-up above). No ballNum=3 in this path.
      return shots;
    }
    // Ball 2 WAS also a strike -- the rack reset again, a genuine 3rd,
    // fresh delivery is owed and always exists as its own final shot.
  }

  // --- ballNum 3: reached either via two strikes (ball1+ball2), or via
  // ball 1's own embedded spare conversion. Always a single, final
  // delivery with no bonus of its own (max 3 balls in the 10th, period).
  const finalBall = balls[i];
  if (!finalBall) return shots;
  const finalStanding = finalBall.pinsStanding || [];
  let result, otherLeave = [], pinCount = "";
  if (finalBall.isStrike) {
    result = "Strike";
  } else {
    // Includes the lone-10-pin case (Weak/Ringing 10 in this app's terms).
    // That distinction is about how the pin physically wobbled, which
    // isn't visible in a static scorecard image, so this defaults to the
    // generic "Other Leave" for the reviewer to reclassify as Weak/Ringing
    // during the review step, rather than guessing something the image
    // can't actually show.
    result = "Other Leave";
    otherLeave = finalStanding;
    pinCount = String(10 - finalStanding.length);

    if (!ball1WasStrike && ball1MadeSpare) {
      // The flagged scenario: ball 1 was open, converted to a spare, and
      // this final bonus ball was NOT a strike. It landed on a freshly-
      // reset rack with nothing earlier in the frame to anchor which pins
      // it actually involved -- confirmed unreliable to read from a real
      // scorecard image by direct inspection, not a theoretical worry.
      warnings.push({
        frame: "10", ballNum: 3,
        message: "This fill ball count may not be reliably read from the scorecard image -- please verify the pin count manually before saving.",
      });
    }
  }
  shots.push({ ...base, frame: "10", ballNum: 3, result, otherLeave, spareMade: "", pinCount });

  return shots;
}

// Converts one extracted game (as returned by the Edge Function) into an
// array of this app's shot records, ready for review before saving.
// `context` = { bowler, league, date, teamId, ball, surface, game }
// Returns { shots, warnings } -- warnings flags specific shots that need
// mandatory manual verification before saving, not just a general "review
// everything" reminder. The review UI should surface these prominently,
// not as an easy-to-miss aside, since they cover cases confirmed
// unreliable to extract correctly, not just generic caution.
export function convertExtractedGameToShots(extractedGame, context) {
  const base = {
    bowler: context.bowler, league: context.league, date: context.date,
    teamId: context.teamId || "", game: String(context.game),
    ball: context.ball || extractedGame.ballUsed || "", surface: context.surface || "",
    lane: "", startingBoard: "", targetArrows: "", strikeDescription: "",
    release: "", miss: [], ballChangeReason: [], notes: "",
  };

  const shots = [];
  const warnings = [];
  for (const frame of extractedGame.frames || []) {
    if (frame.frameNumber === 10) {
      shots.push(...convertTenthFrame(frame, base, warnings));
    } else {
      const shot = convertRegularFrame(frame, base);
      if (shot) shots.push(shot);
    }
  }
  // Each shot needs its own id/ballNum-aware key once actually saved --
  // left for the caller (the save step), since ids should only be
  // generated at the moment of committing, not during review/preview.
  return { shots, warnings };
}
