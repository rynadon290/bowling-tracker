import { describe, it, expect } from 'vitest';
import {
  bowlerLine, sessionLines, awards, casualRecap,
  practiceRecap, practiceComparison, describePractice,
  drillLines,
  drillRecap,
  drillComparison,
  describeDrills,
} from './sessionRecap.js';
import { setManualScore } from './manualScores.js';

const L = 'Just Bowling';
const D = '2026-06-02';
function build(map) {
  let s = {};
  for (const [b, arr] of Object.entries(map)) {
    arr.forEach((v, i) => { if (v != null) s = setManualScore(s, b, L, D, i + 1, String(v)); });
  }
  return s;
}

describe('reading a bowler\'s night', () => {
  it('totals and truncates the average', () => {
    const l = bowlerLine(build({ Ryan: [180, 200, 220] }), 'Ryan', L, D);
    expect(l.total).toBe(600);
    expect(l.average).toBe(200);
  });

  it('counts only games actually entered', () => {
    expect(bowlerLine(build({ A: [150, null, null] }), 'A', L, D).games).toBe(1);
  });

  it('ignores an impossible score', () => {
    expect(bowlerLine(build({ A: [400, 150] }), 'A', L, D).games).toBe(1);
  });

  it('returns nothing for a bowler with no scores', () => {
    expect(bowlerLine({}, 'Nobody', L, D)).toBeNull();
  });
});

describe('casual awards', () => {
  const group = () => sessionLines(
    build({ Ryan: [180, 200, 220], Kim: [210, 215, 205], Sam: [120, 130, 140] }),
    ['Ryan', 'Kim', 'Sam'], L, D);

  it('ranks by series and names the winner', () => {
    const a = awards(group());
    expect(a.find(x => x.id === 'winner').bowler).toBe('Kim');
  });

  // A group of one shouldn't be congratulated for beating nobody.
  it('gives no winner award to a solo bowler', () => {
    const solo = awards(sessionLines(build({ A: [200, 200, 200] }), ['A'], L, D));
    expect(solo.some(x => x.id === 'winner')).toBe(false);
    expect(solo.some(x => x.id === 'bestGame')).toBe(true);
  });

  it('words a close win differently from a comfortable one', () => {
    const close = awards(sessionLines(build({ A: [200, 200, 200], B: [199, 200, 200] }), ['A', 'B'], L, D));
    expect(close.find(x => x.id === 'winner').detail).toContain('close');
  });

  it('handles a tie without declaring a winner by pins', () => {
    const tie = awards(sessionLines(build({ A: [200, 200, 200], B: [200, 200, 200] }), ['A', 'B'], L, D));
    expect(tie.find(x => x.id === 'winner').detail).toContain('Tied');
  });

  // A "comeback" of two pins isn't a comeback; the joke has to be earned.
  it('only awards a comeback or collapse for a real swing', () => {
    const noisy = awards(sessionLines(build({ A: [200, 210, 205] }), ['A'], L, D));
    expect(noisy.some(x => x.id === 'comeback' || x.id === 'collapse')).toBe(false);
    expect(awards(sessionLines(build({ A: [120, 200, 210] }), ['A'], L, D)).some(x => x.id === 'comeback')).toBe(true);
    expect(awards(sessionLines(build({ A: [220, 190, 140] }), ['A'], L, D)).some(x => x.id === 'collapse')).toBe(true);
  });

  it('withholds the consistency award when nobody was actually consistent', () => {
    const spread = awards(sessionLines(build({ A: [120, 200, 260], B: [100, 180, 250] }), ['A', 'B'], L, D));
    expect(spread.some(x => x.id === 'consistent')).toBe(false);
  });
});

describe('practice recap', () => {
  it('compares against the bowler\'s own prior average', () => {
    const p = practiceRecap(build({ Ryan: [190, 200, 210] }), 'Ryan', L, D, 185);
    expect(p.vsAverage).toBe(15);
    expect(describePractice(p)).toContain('15 above your average');
  });

  // Not spun as a positive, and not silently omitted either.
  it('states a below-average night plainly', () => {
    const p = practiceRecap(build({ Ryan: [150, 150, 150] }), 'Ryan', L, D, 185);
    expect(describePractice(p)).toContain('35 below your average');
  });

  it('distinguishes no history from a flat night', () => {
    const none = practiceRecap(build({ Ryan: [190, 200, 210] }), 'Ryan', L, D, null);
    expect(none.vsAverage).toBeNull();
    expect(describePractice(none)).toBe('200 average over 3 games.');
    const flat = practiceRecap(build({ Ryan: [185, 185, 185] }), 'Ryan', L, D, 185);
    expect(describePractice(flat)).toContain('right on your average');
  });
});

describe('practice comparison', () => {
  // Compared on average, since a partner who bowled fewer games would
  // lose on total for a reason that says nothing about how they threw it.
  it('compares on average, not total', () => {
    const c = practiceComparison(build({ Ryan: [200, 200, 200], Dave: [190, 190] }), 'Ryan', ['Dave'], L, D);
    expect(c.comparisons[0].diff).toBe(10);
    expect(c.comparisons[0].sameGameCount).toBe(false);
  });

  it('returns nothing when nobody else bowled', () => {
    expect(practiceComparison(build({ Ryan: [200] }), 'Ryan', [], L, D)).toBeNull();
    expect(practiceComparison(build({ Ryan: [200] }), 'Ryan', ['Ghost'], L, D)).toBeNull();
    expect(practiceComparison(build({ Ryan: [200] }), 'Ryan', ['Ryan'], L, D)).toBeNull();
  });
});

describe('casual recap', () => {
  it('reports the field and the spread', () => {
    const r = casualRecap(build({ Ryan: [180, 200, 220], Kim: [210, 215, 205] }), ['Ryan', 'Kim'], L, D);
    expect(r.bowlerCount).toBe(2);
    expect(r.margin).toBe(30);
  });

  it('has no margin for a single bowler', () => {
    expect(casualRecap(build({ A: [200] }), ['A'], L, D).margin).toBeNull();
  });

  it('returns nothing when nothing was bowled', () => {
    expect(casualRecap({}, ['X'], L, D)).toBeNull();
  });
});

describe('drill recaps', () => {
  const D = '2026-06-02';
  const d = (bowler, target, made, missed, extra = {}) =>
    ({ bowler, date: D, target, made, missed, customTarget: '', ball: '', ...extra });

  it('groups by target and pools repeats of the same target', () => {
    const lines = drillLines([d('Ryan', '10pin', 4, 1), d('Ryan', '10pin', 4, 1)], 'Ryan', D);
    expect(lines).toHaveLength(1);
    expect(lines[0].attempts).toBe(10);
    expect(lines[0].made).toBe(8);
  });

  it('keeps different custom targets apart', () => {
    const lines = drillLines([
      d('Ryan', 'custom', 5, 0, { customTarget: 'Greek Church' }),
      d('Ryan', 'custom', 1, 4, { customTarget: 'Big Four' }),
    ], 'Ryan', D);
    expect(lines).toHaveLength(2);
  });

  // 1 for 2 reads as "50%" and means nothing.
  it('withholds a rate that rests on almost no attempts', () => {
    expect(drillLines([d('Ryan', '10pin', 1, 1)], 'Ryan', D)[0].thin).toBe(true);
    expect(drillLines([d('Ryan', '10pin', 3, 2)], 'Ryan', D)[0].thin).toBe(false);
    expect(describeDrills(drillRecap([d('Ryan', '10pin', 1, 1)], 'Ryan', D))).not.toContain('%');
  });

  it('summarises across every target worked', () => {
    const r = drillRecap([d('Ryan', '10pin', 8, 2), d('Ryan', '7pin', 3, 7)], 'Ryan', D);
    expect(r.rate).toBe(55);
    expect(r.targets).toBe(2);
  });
});

describe('drill comparison', () => {
  const D = '2026-06-02';
  const d = (bowler, target, made, missed) => ({ bowler, date: D, target, made, missed, customTarget: '', ball: '' });

  // Comparing one person's 10-pin rate to another's 4-pin rate would be
  // meaningless and would still look authoritative.
  it('only compares targets both people actually worked', () => {
    const c = drillComparison([
      d('Ryan', '10pin', 8, 2), d('Dave', '10pin', 5, 5),
      d('Ryan', '7pin', 6, 4), d('Dave', '4pin', 7, 3),
    ], 'Ryan', ['Dave'], D);
    expect(c.shared.map(s => s.label)).toEqual(['10 Pin']);
    expect(c.shared[0].others[0].diff).toBe(30);
  });

  it('lists a partner-only target as information, not a contest', () => {
    const c = drillComparison([
      d('Ryan', '10pin', 8, 2), d('Dave', '10pin', 5, 5), d('Dave', '4pin', 7, 3),
    ], 'Ryan', ['Dave'], D);
    expect(c.theirsOnly.some(t => t.label === '4 Pin')).toBe(true);
  });

  it('refuses to state a difference when either side is thin', () => {
    const c = drillComparison([d('Ryan', '10pin', 8, 2), d('Dave', '10pin', 1, 1)], 'Ryan', ['Dave'], D);
    expect(c.shared[0].others[0].diff).toBeNull();
    // The raw attempts are still shown -- withheld conclusion, not withheld data.
    expect(c.shared[0].others[0].attempts).toBe(2);
  });

  it('returns nothing when there is no one to compare against', () => {
    expect(drillComparison([d('Ryan', '10pin', 8, 2)], 'Ryan', ['Dave'], D)).toBeNull();
    expect(drillComparison([d('Ryan', '10pin', 8, 2)], 'Ryan', ['Ryan'], D)).toBeNull();
    expect(drillComparison([d('Dave', '10pin', 8, 2)], 'Ryan', ['Dave'], D)).toBeNull();
  });
});
