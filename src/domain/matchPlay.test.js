import { describe, it, expect } from 'vitest';
import {
  emptyMatchPlay, addMatch, removeMatch, setMatchField, setBonus,
  matchResult, matchPlayTotals, pinDifferential, normalizeMatchPlay,
  DEFAULT_BONUS_PER_WIN,
} from './matchPlay.js';

function block() {
  let mp = emptyMatchPlay();
  mp = addMatch(mp); mp = addMatch(mp); mp = addMatch(mp);
  mp = setMatchField(mp, 1, 'yourScore', '220'); mp = setMatchField(mp, 1, 'opponentScore', '200');
  mp = setMatchField(mp, 2, 'yourScore', '180'); mp = setMatchField(mp, 2, 'opponentScore', '210');
  mp = setMatchField(mp, 3, 'yourScore', '190'); mp = setMatchField(mp, 3, 'opponentScore', '190');
  return mp;
}

describe('match results', () => {
  it('reads win, loss and tie from the two scores', () => {
    const mp = block();
    expect(matchResult(mp.matches[0])).toBe('win');
    expect(matchResult(mp.matches[1])).toBe('loss');
    expect(matchResult(mp.matches[2])).toBe('tie');
  });

  // A match with only your score entered is in progress, not lost.
  it('treats a half-entered match as having no result', () => {
    let mp = addMatch(emptyMatchPlay());
    mp = setMatchField(mp, 1, 'yourScore', '200');
    expect(matchResult(mp.matches[0])).toBeNull();
    const t = matchPlayTotals(mp);
    expect(t.played).toBe(0);
    expect(t.losses).toBe(0);
    expect(t.scratch).toBe(0);
  });

  it('rejects impossible scores', () => {
    expect(normalizeMatchPlay({ matches: [{ yourScore: '400' }] }).matches[0].yourScore).toBe('');
    expect(normalizeMatchPlay({ matches: [{ yourScore: '-5' }] }).matches[0].yourScore).toBe('');
    expect(normalizeMatchPlay({ matches: [{ yourScore: '300' }] }).matches[0].yourScore).toBe('300');
  });
});

describe('bonus pins', () => {
  it('defaults to the common 30 per win', () => {
    expect(Number(emptyMatchPlay().bonusPerWin)).toBe(DEFAULT_BONUS_PER_WIN);
  });

  it('adds bonus for wins and ties on top of scratch', () => {
    const t = matchPlayTotals(block());
    expect(t.scratch).toBe(590);
    expect(t.bonusPins).toBe(45); // one win at 30, one tie at 15
    expect(t.total).toBe(635);
  });

  // Formats vary; a tournament using 20 must produce different standings.
  it('is configurable rather than fixed', () => {
    expect(matchPlayTotals(setBonus(block(), 'bonusPerWin', '20')).bonusPins).toBe(35);
  });

  it('supports a format with no bonus at all', () => {
    const none = setBonus(setBonus(block(), 'bonusPerWin', '0'), 'bonusPerTie', '0');
    expect(matchPlayTotals(none).total).toBe(590);
  });
});

describe('block summary', () => {
  it('averages over matches played, not matches listed', () => {
    let mp = addMatch(block()); // a fourth, empty match
    expect(matchPlayTotals(mp).average).toBe(196); // floor(590 / 3)
    expect(matchPlayTotals(mp).played).toBe(3);
  });

  it('reports pin differential against opponents', () => {
    expect(pinDifferential(block())).toBe(-10); // +20, -30, 0
  });

  it('renumbers matches after one is deleted from the middle', () => {
    const after = removeMatch(block(), 2);
    expect(after.matches.map(m => m.matchNumber)).toEqual([1, 2]);
    expect(after.matches[1].yourScore).toBe('190');
  });
});
