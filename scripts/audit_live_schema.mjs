// Audits the LIVE schema snapshot, not the migration files.
//
// Reads schema-snapshot.csv (produced by scripts/audit_schema.sql,
// which CI regenerates weekly). Every finding
// here is about the database as it actually is -- which is where the
// global leagues.name constraint was hiding while file-based audits kept
// reporting all clear.
import fs from 'fs';

const FILE = 'schema-snapshot.csv';
if (!fs.existsSync(FILE)) {
  console.log(`No ${FILE}. Run scripts/audit_schema.sql, or trigger the Schema snapshot workflow.`);
  console.log('FAILING rather than passing: an audit that cannot see the database');
  console.log('has not checked anything, and reporting success for that is how a');
  console.log('checker ends up trusted while covering nothing.');
  process.exit(1);
}

const rows = [];
{ // minimal CSV parse that survives quoted commas
  const text = fs.readFileSync(FILE, 'utf8');
  let cur = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n') { cur.push(field.replace(/\r$/,'')); rows.push(cur); cur = []; field = ''; }
    else field += c;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
}
const [head, ...body] = rows;
const recs = body.filter(r => r.length >= 4)
  .map(r => ({ kind: r[0], object: r[1], detail: r[2], extra: r[3] }));

const get = k => recs.filter(r => r.kind === k);
const findings = [];
const shared = [];   // global-name constraints that are correct by design
const seenUnique = new Set();
const intentionalLockouts = [];

// 1. RLS disabled anywhere.
for (const r of get('rls')) {
  if (r.detail === 'DISABLED') findings.push(`RLS DISABLED on ${r.object}`);
}

// 2. Unique constraints that are NOT scoped to an owner.
//
// This is the leagues bug generalised: a unique index on a user-facing
// name with no user column makes that name a global namespace, so the
// second user to want it gets 23505 and their data never syncs.
const OWNER_COLS = ['user_id','created_by','owner_id','bowler_id','coach_id'];
for (const r of [...get('constraint'), ...get('index')]) {
  const def = r.extra || '';
  const isUnique = /UNIQUE/i.test(def) || /CREATE UNIQUE/i.test(def);
  if (!isUnique) continue;
  if (/_pkey/.test(r.detail)) continue;
  if (seenUnique.has(`${r.object}.${r.detail}`)) continue;
  seenUnique.add(`${r.object}.${r.detail}`);
  const mentionsOwner = OWNER_COLS.some(c => def.includes(c));
  const looksLikeName = /\bname\b|\btitle\b|\bemail\b/i.test(def);
  if (!looksLikeName || mentionsOwner) continue;

  // A SHARED CATALOG legitimately has one row per name -- oil_patterns
  // is meant to be one "Chameleon" for everyone, not one per bowler.
  // The tell is a read policy open to every signed-in user rather than
  // scoped to a row owner.
  const readPolicies = get('policy').filter(p => p.object === r.object && /SELECT/i.test(p.extra));
  const isSharedCatalog = readPolicies.some(p => /auth\.uid\(\) IS NOT NULL/i.test(p.extra));
  if (isSharedCatalog) {
    shared.push(`${r.object}.${r.detail} (shared catalog -- global name is intended)`);
    continue;
  }
  findings.push(`GLOBAL unique on a name: ${r.object}.${r.detail} -> ${def.slice(0,80)}`);
}

// 3. Security definer functions -- not wrong, but each one bypasses RLS
//    and deserves to be a deliberate choice rather than a surprise.
const definers = get('function').filter(f => f.extra === 'security definer');

// 4. Tables with RLS on but no policy at all.
const policied = new Set(get('policy').map(p => p.object));
for (const r of get('rls')) {
  if (r.detail === 'enabled' && !policied.has(r.object)) {
    // No policy AND no grant is a deliberate lockout: the table is
    // written only by a security definer function. api_usage is exactly
    // that -- letting a user touch their own rate-limit rows would let
    // them clear their own limit.
    intentionalLockouts.push(`${r.object} (no policy, no grant -- definer-only by design)`);
  }
}

// Tables in the database that no migration in this repo creates. Not a
// vulnerability, but every file-based audit is blind to them -- which is
// how a global unique on leagues.name passed several "all clear" reviews.
{
  const sqlText = fs.readdirSync('.').filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const inRepo = new Set([...sqlText.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]));
  const undocumented = get('rls').map(r => r.object).filter(t => !inRepo.has(t)).sort();
  if (undocumented.length) {
    console.log(`${undocumented.length} table(s) exist in the database but in NO migration here.`);
    console.log('This repo cannot rebuild them, and file-based audits cannot see them:');
    console.log('   ' + undocumented.join(', '));
    console.log();
  }
}

console.log(`Snapshot: ${get('column').length} columns, ${get('rls').length} tables, ${get('policy').length} policies, ${get('function').length} functions.\n`);
console.log(`Security definer functions (${definers.length}) -- each bypasses RLS by design:`);
definers.forEach(f => console.log(`   ${f.object}(${f.detail})`));
console.log();
if (intentionalLockouts.length) {
  console.log(`Definer-only tables (${intentionalLockouts.length}):`);
  intentionalLockouts.forEach(x => console.log(`   ${x}`));
  console.log();
}
if (shared.length) {
  console.log(`Shared catalogs with intentional global names (${shared.length}):`);
  shared.forEach(x => console.log(`   ${x}`));
  console.log();
}
// Exits non-zero on a finding, so CI can actually stop on one.
//
// This ran as a CI step and always exited 0 -- it printed its findings
// and the build went green regardless. A step that cannot fail is
// decoration: it looks like coverage, and the first time it matters
// nobody notices.
//
// A finding here is narrow and serious: RLS switched off on a table, or
// a globally-unique constraint on a NAME column (which is how one
// bowler naming a league stops every other bowler using that name).
// Neither is a style preference; both are worth a red build.
//
// Note what is deliberately NOT a finding: tables that exist in the
// database but in no migration. That is real and worth fixing, but it is
// a backlog of 30, and failing on it would mean CI is red until that
// work is done -- at which point the gate gets removed rather than the
// problem fixed.
if (!findings.length) {
  console.log('No findings.');
  process.exit(0);
}
console.log(`${findings.length} finding(s):`);
findings.forEach(f => console.log(`   ${f}`));
process.exit(1);
