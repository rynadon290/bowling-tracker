// Finds fields that are READ but never WRITTEN.
//
// This is the class of bug that unit tests structurally cannot catch:
// `sessionHighlights({ moneyWon: cs.moneyWon })` passes every test when
// you hand it a moneyWon, and silently does nothing forever in production
// because no code ever puts moneyWon on a session. The function was
// right; the wiring was not.
//
// Static and heuristic -- it reports suspects, not verdicts. A name that
// only ever appears on the right of a dot, and never on the left of a
// colon or an assignment, is very likely never populated.
import fs from 'fs';
import path from 'path';

const SRC = 'src';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|ts)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})(SRC);

const src = files.map(f => ({ f, s: fs.readFileSync(f, 'utf8') }));
const all = src.map(x => x.s).join('\n');

// Objects whose fields we care about. These are the app's own record
// shapes -- the things built in one place and read in another.
const SUBJECTS = ['cs', 'session', 's', 'shot', 'task', 'team', 'row', 'r'];

const reads = new Map(); // field -> [where]
for (const { f, s } of src) {
  for (const subj of SUBJECTS) {
    const re = new RegExp(`\\b${subj}\\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'g');
    let m;
    while ((m = re.exec(s))) {
      const field = m[1];
      if (!reads.has(field)) reads.set(field, []);
      reads.get(field).push(f);
    }
  }
}

// A field counts as WRITTEN if it appears as an object key, a property
// assignment, a destructured name, or a database column.
function isWritten(field) {
  const pats = [
    new RegExp(`\\b${field}\\s*:`),          // { field: ... }
    new RegExp(`\\.${field}\\s*=[^=]`),      // obj.field = ...
    new RegExp(`\\b${field}\\s*,`),          // shorthand { field, }
    new RegExp(`["']${field}["']\\s*:`),     // { "field": ... }
    new RegExp(`\\b${field}\\b\\s*\\}`),     // shorthand at end
  ];
  return pats.some(p => p.test(all));
}

// Built-ins and DOM/library members that are never "ours".
const IGNORE = new Set([
  'length','map','filter','forEach','find','reduce','slice','split','join','push',
  'includes','indexOf','toFixed','toString','replace','trim','sort','some','every',
  'flatMap','concat','keys','values','entries','then','catch','data','error','value',
  'current','style','target','id','name','type','props','children','key','message','code',
]);

const suspects = [];
for (const [field, where] of reads) {
  if (IGNORE.has(field)) continue;
  if (field.length < 3) continue;
  if (!isWritten(field)) {
    suspects.push({ field, files: [...new Set(where)] });
  }
}

if (!suspects.length) {
  console.log('No fields are read without being written anywhere.');
} else {
  console.log(`${suspects.length} field(s) read but never written:\n`);
  for (const s of suspects.sort((a, b) => a.field.localeCompare(b.field))) {
    console.log(`  ${s.field}`);
    s.files.slice(0, 2).forEach(f => console.log(`      read in ${f}`));
  }
}
