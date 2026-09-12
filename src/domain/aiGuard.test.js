import { describe, it, expect } from 'vitest';
import {
  citedWithheldMetrics, citedUnknownMetrics, reviewAiOutput, overreachNote,
} from './aiGuard.js';

const withheld = [{ key: 'splitRate' }, { key: 'ball:Phaze II' }, { key: 'drill:10pin' }];

describe('catching an answer that outran the data', () => {
  // The failure this exists for: the app refuses to show a split
  // conversion because the sample is thin, and the AI discusses it
  // anyway. Two parts of one app disagreeing, and the bowler believes
  // the sentence over the empty card.
  it('catches a withheld metric being discussed', () => {
    expect(citedWithheldMetrics('Your split conversion is holding you back.', withheld))
      .toContain('splitRate');
  });

  it('catches a withheld ball being named', () => {
    expect(citedWithheldMetrics('The Phaze II carries better for you.', withheld))
      .toContain('ball:Phaze II');
  });

  it('catches a withheld drill', () => {
    expect(citedWithheldMetrics('Your 10pin drill is improving.', withheld))
      .toContain('drill:10pin');
  });

  it('flags the answer without discarding it', () => {
    const r = reviewAiOutput('Your split conversion is poor.', { withheld });
    expect(r.overreached).toBe(true);
    // An answer that vanishes is worse than one with a caveat.
    expect(r.text).toContain('split conversion');
  });
});

describe('not crying wolf', () => {
  // A false positive suppresses a good answer, so every pattern has to
  // be a phrase that could only mean the metric it maps to.
  it('leaves a clean answer alone', () => {
    const r = reviewAiOutput('Your strike rate is 54%. Keep working the pocket.', { withheld });
    expect(r.overreached).toBe(false);
  });

  it('does not fire on the bare word "spare"', () => {
    expect(citedWithheldMetrics('You left a spare in the eighth.', [{ key: 'spareConversion' }]))
      .toEqual([]);
  });

  it('does not fire on the bare word "split"', () => {
    expect(citedWithheldMetrics('You left a nasty split.', withheld)).toEqual([]);
  });

  it('does not flag a metric that was included rather than withheld', () => {
    const r = reviewAiOutput('Your split conversion is 18%.', {
      included: { splitRate: { value: 18 } }, withheld: [],
    });
    expect(r.overreached).toBe(false);
  });

  // A two-character ball name would match half the alphabet.
  it('ignores very short withheld names', () => {
    expect(citedWithheldMetrics('You are carrying well.', [{ key: 'ball:X' }])).toEqual([]);
  });
});

describe('the note it produces', () => {
  it('names the metric rather than hedging generally', () => {
    // "Some of this may be unreliable" makes the whole answer suspect.
    expect(overreachNote(['splitRate'])).toContain('split conversion');
  });

  it('reads correctly with several', () => {
    const note = overreachNote(['splitRate', 'tenPinRate']);
    expect(note).toContain('split conversion and ten pin conversion');
  });

  it('says nothing when there is nothing to say', () => {
    expect(overreachNote([])).toBe('');
    expect(overreachNote(null)).toBe('');
  });
});

describe('metrics nobody mentioned', () => {
  it('spots a metric that was neither sent nor withheld', () => {
    expect(citedUnknownMetrics('Your corner-pin conversion is weak.', { strikeRate: {} }, []))
      .toContain('cornerPinRate');
  });
});

describe('survives junk', () => {
  it('every entry point', () => {
    for (const junk of [null, undefined, 42, {}, [], 'x']) {
      expect(() => citedWithheldMetrics(junk, junk)).not.toThrow();
      expect(() => citedUnknownMetrics(junk, junk, junk)).not.toThrow();
      expect(() => reviewAiOutput(junk, junk)).not.toThrow();
      expect(() => overreachNote(junk)).not.toThrow();
    }
    expect(citedWithheldMetrics(null, null)).toEqual([]);
    // Arrays CONTAINING junk, not just junk arrays. Checking the first
    // and not the second is the blind spot the fuzz exists to cover.
    for (const junk of [[null], [undefined], [{}], [42], [null, 'splitRate']]) {
      expect(() => overreachNote(junk)).not.toThrow();
      expect(() => citedWithheldMetrics('text', junk)).not.toThrow();
    }
    expect(reviewAiOutput(null, null).overreached).toBe(false);
  });

  // A regex-special character in a ball name must not blow up the match.
  it('handles a ball name with regex characters in it', () => {
    expect(() => citedWithheldMetrics('anything', [{ key: 'ball:C(*)' }])).not.toThrow();
  });
});
