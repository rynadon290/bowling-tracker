import { describe, it, expect } from 'vitest';
import {
  addSidePot, removeSidePot, setSidePotField, sidePotMoney, sidePotTotals, normalizeSidePots,
} from './sidePots.js';

function bracket(entries, cost, won) {
  let pots = addSidePot([], 'Bracket');
  pots = setSidePotField(pots, pots[0].id, 'entries', entries);
  pots = setSidePotField(pots, pots[0].id, 'costPerEntry', cost);
  pots = setSidePotField(pots, pots[0].id, 'winnings', won);
  return pots;
}

describe('side pot money', () => {
  it('multiplies entries by cost rather than asking for a total', () => {
    expect(sidePotMoney(bracket('4', '5', '30')[0]).cost).toBe(20);
  });

  it('nets winnings against cost', () => {
    expect(sidePotMoney(bracket('4', '5', '30')[0]).net).toBe(10);
  });

  it('keeps cents', () => {
    expect(sidePotMoney({ entries: '3', costPerEntry: '1.50', winnings: '0' }).cost).toBe(4.5);
  });

  it('rejects a negative cost', () => {
    expect(normalizeSidePots([{ type: 'Bracket', entries: '1', costPerEntry: '-5' }])[0].costPerEntry).toBe('');
  });

  it('falls back to a known type', () => {
    expect(normalizeSidePots([{ type: 'Nonsense' }])[0].type).toBe('Bracket');
  });
});

describe('side pot totals', () => {
  // The reason for itemising at all: which KIND of side action pays.
  it('breaks results down by type', () => {
    let pots = bracket('4', '5', '30');
    pots = addSidePot(pots, 'Eliminator');
    pots = setSidePotField(pots, pots[1].id, 'entries', '1');
    pots = setSidePotField(pots, pots[1].id, 'costPerEntry', '10');
    const t = sidePotTotals(pots);
    expect(t.byType.find(b => b.type === 'Bracket').net).toBe(10);
    expect(t.byType.find(b => b.type === 'Eliminator').net).toBe(-10);
    expect(t.net).toBe(0);
  });

  it('counts how many of each type cashed', () => {
    const t = sidePotTotals(bracket('4', '5', '30'));
    expect(t.byType[0].cashed).toBe(1);
    expect(t.byType[0].entries).toBe(4);
  });

  it('totals an empty list to zero rather than throwing', () => {
    expect(sidePotTotals([]).net).toBe(0);
    expect(sidePotTotals(null).net).toBe(0);
  });

  it('removes an entry', () => {
    const pots = bracket('1', '5', '0');
    expect(removeSidePot(pots, pots[0].id)).toHaveLength(0);
  });
});
