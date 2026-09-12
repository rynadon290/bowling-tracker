import { describe, it, expect } from 'vitest';
import {
  redact, signatureOf, makeEntry, addEntry, formatForCopy, summarise, MAX_ENTRIES,
} from './errorLog.js';

describe('redact', () => {
  // The one that matters. Postgres puts real values in its error text,
  // and those values are other people's names -- bowlers who may never
  // have installed this app and have agreed to nothing.
  it('strips the value out of a unique-violation message', () => {
    const msg = 'duplicate key value violates unique constraint "sessions_user_id_bowler_name_league_id_date_key" DETAIL: Key (bowler_name)=(Maggie) already exists.';
    const out = redact(msg);
    expect(out).not.toContain('Maggie');
    // The shape survives, which is what makes it diagnosable.
    expect(out).toContain('bowler_name');
  });

  it('strips email addresses wherever they appear', () => {
    expect(redact('invited_email = maggie.smith@example.co.uk failed')).not.toContain('maggie.smith');
    expect(redact('invited_email = maggie@example.com failed')).toContain('*@*');
  });

  it('strips quoted literals but keeps the sentence', () => {
    const out = redact(`new row for relation "teams" violates check '(name = Split Happens)'`);
    expect(out).not.toContain('Split Happens');
    expect(out).toContain('violates check');
  });

  // Double-quoted text in a Postgres error is an IDENTIFIER. Blanking it
  // produced `null value in column "*" of relation "*"` on a real device
  // -- which says something is null somewhere and nothing more.
  it('keeps column, table and constraint names', () => {
    const out = redact('null value in column "score" of relation "manual_scores" violates not-null constraint');
    expect(out).toContain('score');
    expect(out).toContain('manual_scores');
  });

  it('still strips an email that appears inside quotes', () => {
    expect(redact('key "invited_email"=(maggie@example.com) exists')).not.toContain('maggie@example.com');
  });

  // UUIDs name a row, not a person, and they are how you find it again.
  it('keeps uuids', () => {
    const id = 'd1ef5183-b04d-46a1-a485-eb57351d161d';
    expect(redact(`row ${id} not found`)).toContain(id);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 42, {}, []]) {
      expect(() => redact(junk)).not.toThrow();
      expect(redact(junk)).toBe('');
    }
  });

  it('caps length so one runaway message cannot fill the buffer', () => {
    expect(redact('x'.repeat(5000)).length).toBe(300);
  });
});

describe('addEntry', () => {
  const base = { kind: 'write-failed', where: 'teams', code: '42501', message: 'denied' };

  it('records an entry', () => {
    const out = addEntry([], base, 1000);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
    expect(out[0].code).toBe('42501');
  });

  // A render loop should produce one entry with a count, not 400 entries
  // that push everything useful out of the buffer.
  it('merges repeats instead of appending them', () => {
    let out = [];
    for (let i = 0; i < 400; i++) out = addEntry(out, base, 1000 + i);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(400);
    expect(out[0].first).toBe(1000);
    expect(out[0].last).toBe(1399);
  });

  it('keeps different problems apart', () => {
    let out = addEntry([], base, 1);
    out = addEntry(out, { ...base, code: '23505' }, 2);
    expect(out).toHaveLength(2);
  });

  it('puts the newest first', () => {
    let out = addEntry([], base, 1);
    out = addEntry(out, { ...base, where: 'sessions' }, 2);
    expect(out[0].where).toBe('sessions');
  });

  it('caps the buffer', () => {
    let out = [];
    for (let i = 0; i < MAX_ENTRIES + 20; i++) out = addEntry(out, { ...base, where: 't' + i }, i);
    expect(out).toHaveLength(MAX_ENTRIES);
  });

  it('does not mutate the array it was given', () => {
    const before = addEntry([], base, 1);
    const copy = [...before];
    addEntry(before, base, 2);
    expect(before).toEqual(copy);
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) {
      expect(() => addEntry(junk, base, 1)).not.toThrow();
      expect(addEntry(junk, base, 1)).toHaveLength(1);
      expect(() => addEntry([], junk, 1)).not.toThrow();
    }
    expect(addEntry([], null, 1)[0].kind).toBe('unhandled');
  });
});

describe('formatForCopy', () => {
  it('says so plainly when there is nothing', () => {
    expect(formatForCopy([])).toContain('No errors recorded.');
  });

  it('includes the build, the code and the repeat count', () => {
    const out = formatForCopy(
      addEntry(addEntry([], { kind: 'write-failed', where: 'teams', code: '42501', message: 'denied', build: 'index-abc123.js' }, 1),
        { kind: 'write-failed', where: 'teams', code: '42501', message: 'denied' }, 2),
      { build: 'index-abc123.js', generated: '2026-09-11' });
    expect(out).toContain('index-abc123.js');
    expect(out).toContain('42501');
    expect(out).toContain('x2');
  });

  it('never emits a redacted value', () => {
    const out = formatForCopy(addEntry([], {
      kind: 'write-failed', where: 'sessions', code: '23505',
      message: 'Key (bowler_name)=(Maggie) already exists',
    }, 1));
    expect(out).not.toContain('Maggie');
  });

  it('survives junk', () => {
    for (const junk of [null, undefined, 'x', 42, {}, [null, 7]]) {
      expect(() => formatForCopy(junk)).not.toThrow();
    }
  });
});

describe('summarise', () => {
  // 400 repeats of one bug is one problem. Showing 400 makes it look
  // like forty.
  it('counts distinct problems separately from total events', () => {
    let out = [];
    for (let i = 0; i < 5; i++) out = addEntry(out, { kind: 'crash', where: 'a', message: 'm' }, i);
    out = addEntry(out, { kind: 'crash', where: 'b', message: 'm' }, 99);
    expect(summarise(out)).toMatchObject({ distinct: 2, total: 6 });
  });

  it('survives junk', () => {
    expect(summarise(null)).toMatchObject({ distinct: 0, total: 0 });
  });
});

describe('signatureOf', () => {
  it('ignores differing values inside an otherwise identical message', () => {
    const a = { kind: 'write-failed', where: 'sessions', code: '23505', message: 'Key (bowler_name)=(Maggie) exists' };
    const b = { kind: 'write-failed', where: 'sessions', code: '23505', message: 'Key (bowler_name)=(Dave) exists' };
    expect(signatureOf(a)).toBe(signatureOf(b));
  });

  it('survives junk', () => {
    expect(() => signatureOf(null)).not.toThrow();
  });
});

describe('makeEntry', () => {
  it('falls back to a known kind', () => {
    expect(makeEntry({ kind: 'nonsense' }).kind).toBe('unhandled');
  });
});

describe('import problems are their own kinds', () => {
  // The import path catches its own errors and shows a message, so none
  // of it reaches the global handlers -- the log was blind to every
  // import problem since it was built.
  it('keeps each import kind rather than flattening to unhandled', () => {
    for (const kind of ['import-failed', 'import-empty', 'import-quality', 'import-score-mismatch']) {
      const log = addEntry([], { kind, where: 'x', message: 'm' }, 1);
      expect(log[0].kind).toBe(kind);
    }
  });

  // They answer different questions: the reader breaking, a photo it
  // could not use, a photo it half-used, and a reading that contradicts
  // itself. Lumping them hides which is actually happening.
  it('still falls back for a kind nobody registered', () => {
    expect(addEntry([], { kind: 'made-up', where: 'x', message: 'm' }, 1)[0].kind).toBe('unhandled');
  });

  // Redaction strips values, and these messages ARE numbers -- a
  // mismatch entry with the figures stripped would say nothing.
  it('leaves the figures readable', () => {
    const log = addEntry([], {
      kind: 'import-score-mismatch', where: 'x',
      message: 'card says 189, frames score 176',
    }, 1);
    expect(log[0].message).toContain('189');
    expect(log[0].message).toContain('176');
  });
});
