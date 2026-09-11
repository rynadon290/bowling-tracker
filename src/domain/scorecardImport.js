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
  if (!extractedGame || typeof extractedGame !== "object" || Array.isArray(extractedGame)) return null;
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

// ── Team scorecards ─────────────────────────────────────────────────────
//
// The extraction returns one entry per bowler column. This normalizes
// that into a shape the review screen can work with, and handles the
// legacy single-bowler response (a bare `games` array) so an older
// deployed function keeps working.

// Series is ALWAYS available: printed if the card shows it, otherwise
// summed from the games. A bowler should never have to add up their own
// three scores because the card didn't print a total.
export function seriesFor(bowlerEntry) {
  const printed = Number(bowlerEntry?.seriesTotal);
  const games = Array.isArray(bowlerEntry?.games) ? bowlerEntry.games : [];
  const scores = games
    .map(g => Number(g?.totalScore))
    .filter(v => Number.isFinite(v) && v >= 0 && v <= 300);
  const computed = scores.length ? scores.reduce((a, b) => a + b, 0) : null;

  if (Number.isFinite(printed) && printed > 0) {
    return {
      series: printed,
      source: "printed",
      // Surfaced rather than silently preferred: if the printed total and
      // the games disagree, that's a misread worth a human glance, not
      // something to paper over by picking one.
      disagrees: computed !== null && computed !== printed,
      computed,
    };
  }
  return { series: computed, source: computed === null ? "none" : "computed", disagrees: false, computed };
}

export function normalizeExtraction(data) {
  // Current shape: a FLAT games list, each game tagged with its bowler.
  // Flat rather than nested because nesting games inside a bowlers array
  // pushed the response schema past Gemini's complexity limit -- see the
  // comment on RESPONSE_SCHEMA in the Edge Function.
  if (Array.isArray(data?.games) && data.games.length) {
    const byBowler = new Map();
    // The model reliably names the FIRST game of each bowler and then
    // leaves bowlerName null on the rest -- so grouping on the name alone
    // split one bowler into "their first game" plus a nameless column
    // holding the other two.
    //
    // lineupPosition is the stable identifier when it's present; when it
    // isn't, the name carries forward from the last named game, because
    // the list arrives in card order.
    let lastName = "";
    let lastPosition = null;

    data.games.forEach((g) => {
      const rawName = (g?.bowlerName || "").trim();
      const rawPosition = Number.isInteger(g?.lineupPosition) ? g.lineupPosition : null;
      if (rawName) lastName = rawName;
      if (rawPosition !== null) lastPosition = rawPosition;

      const name = rawName || lastName;
      const position = rawPosition !== null ? rawPosition : lastPosition;
      // Position first: it survives a missing name, and two bowlers with
      // the same printed name (a father and son on one team) still get
      // their own column.
      const key = position !== null ? `pos:${position}` : (name.toLowerCase() || "__unnamed__");

      if (!byBowler.has(key)) {
        byBowler.set(key, {
          scorecardName: name,
          lineupPosition: position !== null ? position : byBowler.size,
          seriesTotal: Number.isFinite(Number(g?.seriesTotal)) ? Number(g.seriesTotal) : null,
          games: [],
        });
      }
      const entry = byBowler.get(key);
      // A name arriving on a later game fills in a column that started
      // nameless, rather than being ignored.
      if (!entry.scorecardName && name) entry.scorecardName = name;
      // seriesTotal is repeated across a bowler's games; take the first
      // real one so a null on a later game can't wipe it.
      if (entry.seriesTotal == null && Number.isFinite(Number(g?.seriesTotal))) {
        entry.seriesTotal = Number(g.seriesTotal);
      }
      entry.games.push(g);
    });

    return [...byBowler.values()]
      .sort((a, b) => a.lineupPosition - b.lineupPosition)
      .map(e => ({ ...e, games: e.games.sort((a, b) => (a?.gameNumber ?? 0) - (b?.gameNumber ?? 0)), ...seriesFor(e) }));
  }

  // Older deployed function: games nested inside a bowlers array.
  if (Array.isArray(data?.bowlers) && data.bowlers.length) {
    return data.bowlers.map((b, i) => ({
      scorecardName: (b?.bowlerName || "").trim(),
      lineupPosition: Number.isInteger(b?.lineupPosition) ? b.lineupPosition : i,
      games: Array.isArray(b?.games) ? b.games : [],
      ...seriesFor(b),
    }));
  }
  return [];
}

// Whether a bowler's column carries per-frame detail, or only totals.
// Both are valid imports -- shot-by-shot gives shots, totals-only gives
// game scores -- and the review screen says which the bowler is getting.
export function detailLevel(entry) {
  const games = Array.isArray(entry?.games) ? entry.games : [];
  const withFrames = games.filter(g => Array.isArray(g?.frames) && g.frames.length).length;
  if (!games.length) return "none";
  if (withFrames === games.length) return "shots";
  if (withFrames === 0) return "scores";
  return "mixed";
}

// Merging columns that turned out to be the same bowler.
//
// Uploading several images is normal and worth supporting: LaneTalk
// scrolls, so games 1-3 and 4-6 are often two screenshots, and a wide
// team card is often photographed in halves. All the images go to the
// extraction as one card, which means one bowler can legitimately come
// back as two columns.
//
// Left alone that is a real problem now that these write to other
// people's records: two columns for one person means two pending
// records, or half their games silently dropped. Merging by the bowler
// they were MATCHED to (not by the printed name, which may differ
// between shots) folds them back into one.
export function mergeColumnsByBowler(columns) {
  const merged = [];
  const byBowler = new Map();

  for (const col of (Array.isArray(columns) ? columns : [])) {
    const key = col.assigned;
    // Unassigned columns stay separate -- they still need a human to say
    // who they are, and guessing that two unknowns are the same person
    // would be exactly the wrong kind of clever.
    if (!key) { merged.push(col); continue; }

    if (!byBowler.has(key)) {
      byBowler.set(key, { ...col, games: [...(col.games || [])], mergedFrom: 1 });
      merged.push(byBowler.get(key));
      continue;
    }

    const target = byBowler.get(key);
    const seen = new Set(target.games.map(g => g?.gameNumber));
    for (const g of (col.games || [])) {
      // A game number already present is the same game photographed
      // twice, not a fourth game. Keep whichever has frame detail --
      // shot-by-shot beats a bare total.
      if (seen.has(g?.gameNumber)) {
        const i = target.games.findIndex(x => x?.gameNumber === g?.gameNumber);
        const existingHasFrames = Array.isArray(target.games[i]?.frames) && target.games[i].frames.length;
        const incomingHasFrames = Array.isArray(g?.frames) && g.frames.length;
        if (!existingHasFrames && incomingHasFrames) target.games[i] = g;
        continue;
      }
      target.games.push(g);
      seen.add(g?.gameNumber);
    }
    target.games.sort((a, b) => (a?.gameNumber ?? 0) - (b?.gameNumber ?? 0));
    target.mergedFrom += 1;
    // Series is recomputed from the combined games unless one shot
    // actually printed a series total.
    const printed = [col, target].find(c => c.source === "printed");
    Object.assign(target, printed && printed.series
      ? { series: printed.series, source: "printed" }
      : seriesFor({ games: target.games, seriesTotal: null }));
  }

  return merged;
}
