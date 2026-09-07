import { describe, it, expect } from 'vitest';
import { strikeDescriptionsForHand, storedStrikeDescriptionFor } from './constants.js';


// "Trip 4" and "Kick 10" name the specific pin that carried through or
// got kicked out. A lefty's ball approaches from the opposite side, so
// she is never going to kick a 10 or trip a 4 -- her equivalents are the
// mirror pins (matching the same deck mirror splits.js uses elsewhere).
// The other descriptions aren't tied to a specific pin and stay as-is.
describe('strike descriptions follow the bowler\'s hand', () => {
  it('mirrors only the two pin-specific descriptions', () => {
    const lefty = strikeDescriptionsForHand(true);
    expect(lefty).toContain('Trip 6');
    expect(lefty).toContain('Kick 7');
    expect(lefty).not.toContain('Trip 4');
    expect(lefty).not.toContain('Kick 10');
  });

  it('leaves the hand-neutral descriptions untouched', () => {
    const lefty = strikeDescriptionsForHand(true);
    for (const d of ['Flush', 'High', 'Light', 'Messenger', 'Half Pocket', 'Brooklyn']) {
      expect(lefty).toContain(d);
    }
  });

  it('keeps Messenger in the list for both hands, right after Light', () => {
    const righty = strikeDescriptionsForHand(false);
    expect(righty.indexOf('Light')).toBeLessThan(righty.indexOf('Messenger'));
    expect(righty.indexOf('Messenger')).toBeLessThan(righty.indexOf('Half Pocket'));
  });

  it('stores the canonical value regardless of which label was tapped', () => {
    expect(storedStrikeDescriptionFor('Trip 6')).toBe('Trip 4');
    expect(storedStrikeDescriptionFor('Kick 7')).toBe('Kick 10');
    expect(storedStrikeDescriptionFor('Flush')).toBe('Flush');
  });

  it('round-trips: a lefty\'s own label maps back to the canonical value and back to her label', () => {
    const stored = storedStrikeDescriptionFor('Kick 7');
    expect(strikeDescriptionsForHand(true).find(l => storedStrikeDescriptionFor(l) === stored)).toBe('Kick 7');
  });
});
