import { describe, it, expect } from 'vitest';
import { convertExtractedGameToShots,
  normalizeExtraction,
  detailLevel,
} from './scorecardImport.js';
import { strictPartial } from './scoring.js';

const context = { bowler: 'Ryan', league: 'Thursday House Shot', date: '2026-09-03', teamId: 't1', game: 1 };

// All ten pins, used to build a "knocked nothing down" gutter-ball frame.
const ALL_PINS = Array.from({ length: 10 }, (_, i) => String(i + 1));
function gutterFrame(n) {
  return { frameNumber: n, balls: [{ isStrike: false, pinsStanding: ALL_PINS }, { isStrike: false, pinsStanding: ALL_PINS }] };
}

describe('convertExtractedGameToShots -- 10th frame scenarios (isolated)', () => {
  // Frames 1-9 are all pure gutter balls (worth 0, no bonus interactions),
  // so the final game score directly and unambiguously reflects only the
  // 10th frame's own contribution -- removing any ambiguity about what
  // frames 1-9 contributed.
  function scoreWithTenth(tenthFrameBalls) {
    const frames = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(gutterFrame);
    frames.push({ frameNumber: 10, balls: tenthFrameBalls });
    const { shots } = convertExtractedGameToShots({ frames }, context);
    return strictPartial(shots);
  }

  it('X X X -- three strikes scores 10+10+10=30', () => {
    const score = scoreWithTenth([
      { isStrike: true, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
    ]);
    expect(score).toBe(30);
  });

  it('X X 7 -- two strikes then a partial 3rd ball scores 10+10+7=27', () => {
    const score = scoreWithTenth([
      { isStrike: true, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
    ]);
    expect(score).toBe(27);
  });

  it('X 7/ -- strike then an open ball-2 that converts scores 10+7+3=20', () => {
    const score = scoreWithTenth([
      { isStrike: true, pinsStanding: [] },
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
      { isStrike: false, pinsStanding: [] },
    ]);
    expect(score).toBe(20);
  });

  it('X 7-2 -- strike then an open ball-2 that stays open scores 10+7+2=19', () => {
    const score = scoreWithTenth([
      { isStrike: true, pinsStanding: [] },
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
      { isStrike: false, pinsStanding: ['1'] },
    ]);
    expect(score).toBe(19);
  });

  it('7/ X -- ball 1 converts to a spare, bonus ball strikes: scores 10+10=20', () => {
    const score = scoreWithTenth([
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
      { isStrike: false, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
    ]);
    expect(score).toBe(20);
  });

  it('8/ 8 -- ball 1 converts to a spare, non-strike bonus ball of 8: scores 10+8=18', () => {
    const score = scoreWithTenth([
      { isStrike: false, pinsStanding: ['1', '2'] },
      { isStrike: false, pinsStanding: [] },
      { isStrike: false, pinsStanding: ['1', '2'] },
    ]);
    expect(score).toBe(18);
  });

  it('7/ X correctly assigns the bonus ball to ballNum=3, never ballNum=2, since ball 1 was not itself a strike', () => {
    const frames = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(gutterFrame);
    frames.push({
      frameNumber: 10,
      balls: [
        { isStrike: false, pinsStanding: ['1', '2', '3'] },
        { isStrike: false, pinsStanding: [] },
        { isStrike: true, pinsStanding: [] },
      ],
    });
    const { shots } = convertExtractedGameToShots({ frames }, context);
    const tenthShots = shots.filter(s => s.frame === '10');
    expect(tenthShots.map(s => s.ballNum)).toEqual([1, 3]); // never [1, 2]
  });

  it('7-2 -- an open ball 1 that never converts ends the frame with no bonus ball at all: scores 7+2=9', () => {
    const score = scoreWithTenth([
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
      { isStrike: false, pinsStanding: ['1'] },
    ]);
    expect(score).toBe(9);
  });

  it('an open, non-converted ball 1 produces exactly one shot record for the 10th, ignoring any extra balls mistakenly reported', () => {
    const frames = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(gutterFrame);
    frames.push({
      frameNumber: 10,
      balls: [
        { isStrike: false, pinsStanding: ['1', '2', '3'] },
        { isStrike: false, pinsStanding: ['1'] },
        { isStrike: true, pinsStanding: [] }, // should never happen, but must not be trusted if it does
      ],
    });
    const { shots } = convertExtractedGameToShots({ frames }, context);
    expect(shots.filter(s => s.frame === '10')).toHaveLength(1);
  });
});

describe('convertExtractedGameToShots -- warnings for confirmed-unreliable extraction', () => {
  // Specifically: an open ball 1 that converts to a spare, followed by a
  // non-strike bonus ball. That bonus ball lands on a freshly-reset rack
  // with nothing earlier in the frame to anchor which pins it involved --
  // confirmed unreliable to read from a real scorecard image, not a
  // theoretical concern. Every other 10th-frame shape has some anchor
  // (a strike is unambiguous; the frame's actual final state is directly
  // readable when the last ball IS the deciding one), so this is the one
  // specific case that needs a mandatory manual check before saving.
  function warningsFor(tenthFrameBalls) {
    const frames = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(gutterFrame);
    frames.push({ frameNumber: 10, balls: tenthFrameBalls });
    return convertExtractedGameToShots({ frames }, context).warnings;
  }

  it('flags exactly the open-spare-then-nonstrike-bonus case', () => {
    const warnings = warningsFor([
      { isStrike: false, pinsStanding: ['1', '2'] },
      { isStrike: false, pinsStanding: [] },
      { isStrike: false, pinsStanding: ['1', '2'] },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ frame: '10', ballNum: 3 });
  });

  it('does NOT flag the same open-spare setup when the bonus ball is a strike (unambiguous -- all pins down)', () => {
    expect(warningsFor([
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
      { isStrike: false, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
    ])).toHaveLength(0);
  });

  it('does NOT flag strike-strike-partial, even though it also has a 3rd/final ball', () => {
    expect(warningsFor([
      { isStrike: true, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
      { isStrike: false, pinsStanding: ['1', '2', '3'] },
    ])).toHaveLength(0);
  });

  it('does NOT flag a triple strike', () => {
    expect(warningsFor([
      { isStrike: true, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
      { isStrike: true, pinsStanding: [] },
    ])).toHaveLength(0);
  });

  it('does NOT flag regular frames 1-9', () => {
    const { warnings } = convertExtractedGameToShots(
      { frames: [{ frameNumber: 1, balls: [{ isStrike: false, pinsStanding: ['1', '2'] }, { isStrike: false, pinsStanding: [] }] }] },
      context,
    );
    expect(warnings).toHaveLength(0);
  });

  it('the flagged shot itself still scores correctly -- a warning does not mean the data is unusable, just unverified', () => {
    const frames = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(gutterFrame);
    frames.push({
      frameNumber: 10,
      balls: [
        { isStrike: false, pinsStanding: ['1', '2'] },
        { isStrike: false, pinsStanding: [] },
        { isStrike: false, pinsStanding: ['1', '2'] },
      ],
    });
    const { shots } = convertExtractedGameToShots({ frames }, context);
    expect(strictPartial(shots)).toBe(18);
  });
});

describe('convertExtractedGameToShots -- regular frames 1-9', () => {
  it('a strike frame produces a clean Strike shot with no pinCount needed', () => {
    const frames = [{ frameNumber: 1, balls: [{ isStrike: true, pinsStanding: [] }] }];
    const { shots } = convertExtractedGameToShots({ frames }, context);
    expect(shots[0]).toMatchObject({ result: 'Strike', otherLeave: [], spareMade: '', pinCount: '' });
  });

  it('a converted spare stores pinCount as the FIRST-ball count, matching the app\'s own handleLeaveToggle convention', () => {
    // 9/ -- ball 1 leaves pin 1 standing (9 knocked), ball 2 converts
    const frames = [{ frameNumber: 1, balls: [{ isStrike: false, pinsStanding: ['1'] }, { isStrike: false, pinsStanding: [] }] }];
    const { shots } = convertExtractedGameToShots({ frames }, context);
    expect(shots[0]).toMatchObject({ result: 'Other Leave', otherLeave: ['1'], spareMade: 'Yes', pinCount: '9' });
  });

  it('an open frame that stays open stores pinCount as the TOTAL combined pinfall for both balls, and it actually scores correctly', () => {
    // 7-2: ball 1 leaves 3 pins standing (7 knocked), ball 2 knocks 2 more, 1 remains -> total 9
    const frames = [{ frameNumber: 1, balls: [{ isStrike: false, pinsStanding: ['1', '2', '3'] }, { isStrike: false, pinsStanding: ['1'] }] }];
    const { shots } = convertExtractedGameToShots({ frames }, context);
    expect(shots[0]).toMatchObject({ result: 'Other Leave', otherLeave: ['1', '2', '3'], spareMade: 'No', pinCount: '9' });

    const restShots = [2, 3, 4, 5, 6, 7, 8, 9].map(n => convertExtractedGameToShots({ frames: [gutterFrame(n)] }, context).shots[0]);
    const tenthShots = convertExtractedGameToShots({ frames: [{ frameNumber: 10, balls: [{ isStrike: false, pinsStanding: ALL_PINS }, { isStrike: false, pinsStanding: ALL_PINS }] }] }, context).shots;
    const isolatedScore = strictPartial([shots[0], ...restShots, ...tenthShots]);
    expect(isolatedScore).toBe(9); // confirms the stored pinCount actually scores correctly, not just looks right
  });
});

describe('convertExtractedGameToShots -- real end-to-end game from an actual uploaded screenshot', () => {
  it('reproduces the exact 205 total from a real LaneTalk Game 1 (X X X 9/ 9/ 9/ X 8/ X 9-)', () => {
    const frames = [
      { frameNumber: 1, balls: [{ isStrike: true, pinsStanding: [] }] },
      { frameNumber: 2, balls: [{ isStrike: true, pinsStanding: [] }] },
      { frameNumber: 3, balls: [{ isStrike: true, pinsStanding: [] }] },
      { frameNumber: 4, balls: [{ isStrike: false, pinsStanding: ['1'] }, { isStrike: false, pinsStanding: [] }] },
      { frameNumber: 5, balls: [{ isStrike: false, pinsStanding: ['10'] }, { isStrike: false, pinsStanding: [] }] },
      { frameNumber: 6, balls: [{ isStrike: false, pinsStanding: ['7'] }, { isStrike: false, pinsStanding: [] }] },
      { frameNumber: 7, balls: [{ isStrike: true, pinsStanding: [] }] },
      { frameNumber: 8, balls: [{ isStrike: false, pinsStanding: ['7', '10'] }, { isStrike: false, pinsStanding: [] }] },
      { frameNumber: 9, balls: [{ isStrike: true, pinsStanding: [] }] },
      { frameNumber: 10, balls: [{ isStrike: false, pinsStanding: ['1'] }, { isStrike: false, pinsStanding: ['1'] }] },
    ];
    const { shots, warnings } = convertExtractedGameToShots({ frames }, context);
    expect(shots).toHaveLength(10);
    expect(strictPartial(shots)).toBe(205);
    expect(warnings).toHaveLength(0); // this game's 10th ended on an open, non-converted ball 1 -- no bonus ball at all
  });
});

describe('team scorecards', () => {
  // The flat shape the Edge Function now returns: one entry per game,
  // each tagged with its bowler. Flat rather than nested because the
  // nested version pushed the response schema past Gemini's complexity
  // limit and every request failed.
  const flat = {
    games: [
      { bowlerName: 'R. Nadon', lineupPosition: 0, seriesTotal: 600, gameNumber: 1, totalScore: 200, frames: [{}] },
      { bowlerName: 'R. Nadon', lineupPosition: 0, seriesTotal: 600, gameNumber: 2, totalScore: 210, frames: [{}] },
      { bowlerName: 'Kim N', lineupPosition: 1, gameNumber: 1, totalScore: 180 },
      { bowlerName: 'Kim N', lineupPosition: 1, gameNumber: 2, totalScore: 175 },
    ],
  };

  it('groups a flat game list back into one column per bowler', () => {
    const cols = normalizeExtraction(flat);
    expect(cols).toHaveLength(2);
    expect(cols[0].scorecardName).toBe('R. Nadon');
    expect(cols[0].games).toHaveLength(2);
  });

  it('keeps columns in lineup order', () => {
    expect(normalizeExtraction(flat).map(c => c.lineupPosition)).toEqual([0, 1]);
  });

  // seriesTotal is repeated on each of a bowler's games; a missing value
  // on a later game must not wipe one already read.
  it('takes the first real series total for a bowler', () => {
    expect(normalizeExtraction(flat)[0].series).toBe(600);
    expect(normalizeExtraction(flat)[0].source).toBe('printed');
  });

  // The model reliably names a bowler's FIRST game and leaves the rest
  // null. Grouping on the name alone split one bowler into their first
  // game plus a nameless column holding the others -- which is how a
  // three-game series showed up as one game.
  it('keeps a bowler together when only their first game is named', () => {
    const partial = normalizeExtraction({ games: [
      { bowlerName: 'R. Nadon', lineupPosition: 0, seriesTotal: 600, gameNumber: 1, totalScore: 200 },
      { bowlerName: null, lineupPosition: 0, gameNumber: 2, totalScore: 210 },
      { bowlerName: null, lineupPosition: 0, gameNumber: 3, totalScore: 190 },
      { bowlerName: 'B. Smith', lineupPosition: 1, gameNumber: 1, totalScore: 150 },
    ] });
    expect(partial).toHaveLength(2);
    expect(partial[0].scorecardName).toBe('R. Nadon');
    expect(partial[0].games).toHaveLength(3);
    expect(partial[0].series).toBe(600);
  });

  it('carries the name forward when there are no lineup positions either', () => {
    const noPos = normalizeExtraction({ games: [
      { bowlerName: 'R. Nadon', gameNumber: 1, totalScore: 200 },
      { bowlerName: null, gameNumber: 2, totalScore: 210 },
      { bowlerName: null, gameNumber: 3, totalScore: 190 },
    ] });
    expect(noPos).toHaveLength(1);
    expect(noPos[0].games).toHaveLength(3);
  });

  // Position beats name, so two bowlers sharing a printed name -- a
  // father and son on one team -- still get their own column.
  it('separates two bowlers with the same printed name by position', () => {
    const sameName = normalizeExtraction({ games: [
      { bowlerName: 'J. Smith', lineupPosition: 0, gameNumber: 1, totalScore: 200 },
      { bowlerName: 'J. Smith', lineupPosition: 1, gameNumber: 1, totalScore: 150 },
    ] });
    expect(sameName).toHaveLength(2);
  });

  it('treats unnamed games as ONE bowler, not one per game', () => {
    const solo = normalizeExtraction({ games: [{ gameNumber: 1, totalScore: 200 }, { gameNumber: 2, totalScore: 210 }] });
    expect(solo).toHaveLength(1);
    expect(solo[0].series).toBe(410);
  });

  const team = {
    bowlers: [
      { bowlerName: 'R. Nadon', lineupPosition: 0, seriesTotal: 600, games: [
        { gameNumber: 1, totalScore: 200, frames: [{}] }, { gameNumber: 2, totalScore: 210, frames: [{}] }, { gameNumber: 3, totalScore: 190, frames: [{}] }] },
      { bowlerName: 'Kim N', lineupPosition: 1, games: [{ gameNumber: 1, totalScore: 180 }, { gameNumber: 2, totalScore: 175 }] },
    ],
  };

  // An older deployed function still returns the nested shape.
  it('still reads the older nested shape', () => {
    expect(normalizeExtraction(team)).toHaveLength(2);
  });

  // A bowler should never have to add up their own three scores because
  // the card didn't print a total.
  it('always resolves a series -- printed or summed', () => {
    const cols = normalizeExtraction(team);
    expect(cols[0].series).toBe(600);
    expect(cols[0].source).toBe('printed');
    expect(cols[1].series).toBe(355);
    expect(cols[1].source).toBe('computed');
  });

  // Disagreement is a misread worth a human glance, not something to
  // paper over by silently preferring one source.
  it('flags a printed total that disagrees with the games', () => {
    const bad = normalizeExtraction({ bowlers: [{ bowlerName: 'X', seriesTotal: 999, games: [{ totalScore: 100 }, { totalScore: 100 }] }] });
    expect(bad[0].disagrees).toBe(true);
    expect(bad[0].computed).toBe(200);
  });

  it('says whether a column carries shots or only scores', () => {
    const cols = normalizeExtraction(team);
    expect(detailLevel(cols[0])).toBe('shots');
    expect(detailLevel(cols[1])).toBe('scores');
  });

  // An older deployed extraction function returns a bare games array.
  it('still reads the legacy single-bowler shape', () => {
    expect(normalizeExtraction({ games: [{ gameNumber: 1, totalScore: 200 }] })).toHaveLength(1);
  });

  it('is safe with nothing extracted', () => {
    expect(normalizeExtraction(null)).toEqual([]);
    expect(normalizeExtraction({})).toEqual([]);
  });
});
