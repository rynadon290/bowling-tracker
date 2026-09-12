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
// Comments are stripped before anything is matched.
//
// Without this the audit reads its own history: `goalsHit` and
// `pokerWinnings` were reported as suspects purely because the comments
// recording their fixes still name them. A checker that fires on the
// note explaining a fix teaches you to ignore it.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // line comments, sparing http://
}
const src = files.map(f => ({ f, s: stripComments(fs.readFileSync(f, 'utf8')) }));
const all = src.map(x => x.s).join('\n');
const SUBJECTS = ['cs', 'session', 's', 'shot', 'task', 'team', 'row', 'r'];
const reads = new Map();
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
function isWritten(field) {
  const pats = [
    new RegExp(`\\b${field}\\s*:`),
    new RegExp(`\\.${field}\\s*=[^=]`),
    new RegExp(`\\b${field}\\s*,`),
    new RegExp(`["']${field}["']\\s*:`),
    new RegExp(`\\b${field}\\b\\s*\\}`),
  ];
  return pats.some(p => p.test(all));
}
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
  if (!isWritten(field)) suspects.push({ field, files: [...new Set(where)] });
}
// A RATCHET, not a gate -- because this audit is explicitly heuristic.
//
// It reports suspects, not verdicts: `accepted_at` is a real database
// column, read from rows the server writes, and no amount of scanning
// src/ will ever see it being set. Failing on every suspect would make
// the check permanently red, and a permanently red check gets deleted.
//
// So the known suspects are recorded by NAME, and the build fails only
// on one that is new. That is the case worth stopping for: a field
// someone just started reading and nothing populates.
//
// It exited 0 unconditionally before, which made it a CI step that could
// not fail -- it printed its suspects and the build went green either
// way.
const BASELINE = 'audit_dataflow_baseline.json';
let known = [];
// The baseline is an OBJECT, name -> reason, not a bare list. A list of
// names records that something was accepted; it does not record why, and
// a year from now nobody can tell an agreed false positive from
// something quietly waved through.
try {
  const parsed = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  known = Array.isArray(parsed) ? parsed : Object.keys(parsed);
} catch { known = []; }
const knownSet = new Set(known);

const fresh = suspects.filter(s => !knownSet.has(s.field));
const gone = known.filter(f => !suspects.some(s => s.field === f));

if (gone.length) {
  console.log(`${gone.length} previously-known suspect(s) no longer appear: ${gone.join(', ')}`);
  console.log('Prune them from ' + BASELINE + ' when convenient.\n');
}

if (!fresh.length) {
  console.log(`No new fields read without being written. (${suspects.length} known suspect(s).)`);
  process.exit(0);
}

console.log(`${fresh.length} NEW field(s) read but never written:\n`);
for (const s of fresh.sort((a, b) => a.field.localeCompare(b.field))) {
  console.log(`  ${s.field}`);
  s.files.slice(0, 3).forEach(f => console.log(`      read in ${f}`));
}
console.log('\nIf one of these is a false positive -- a database column, say --');
console.log('add its name to ' + BASELINE + '. If it is not, something reads a');
console.log('field that nothing ever sets, and it has been doing nothing at all.');
process.exit(1);
