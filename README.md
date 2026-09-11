# My Bowling Vault 🎳

A mobile-first bowling tracker for league bowlers — scores, shot-by-shot
detail, team standings, side pots and season stats. Built for a real
Tuesday night: one phone, one thumb, four teammates to keep score for, and
a wifi signal that comes and goes.

Live at **[rynadon290.github.io/bowling-tracker](https://rynadon290.github.io/bowling-tracker)**.

---

## What it does

**Log a night however you want to.** Four modes, chosen per session:

| | |
|---|---|
| **A practice session** | Drills and the detail fields |
| **A league night** | Money games and the team roster |
| **A tournament** | Blocks and the cut line |
| **A game or two out** | Scores and standings only |

Track three numbers or every delivery. Score for yourself or for the whole
team from one device. Import a scorecard by photographing the monitor.

**It works at the lanes.** Everything is local-first: scores are written
to the device immediately and synced when there's signal. A failed write
is queued, retried in order, and survives a reload — a night logged in a
basement alley with no bars is not a night lost.

**The stats are the point.** Strike and spare percentages, carry by ball,
frame position, split conversion, ten-pin leaves, running averages,
theoretical scores, and where your game is actually costing you pins.
Cards that need shot-by-shot data hide themselves when it isn't there,
rather than showing a screen of zeroes.

---

## Running it

```bash
npm ci
npm run dev      # local dev server
npm test         # unit tests
npm run build    # production build
```

Deployment is automatic: merging to `main` builds and publishes to GitHub
Pages, and Supabase Edge Functions deploy on change.

---

## Layout

```
src/
  domain/        Pure logic — scoring, stats, money, sync rules.
                 No React, no browser, fully tested.
  *.jsx          Screens and components.
  syncQueue.js   The offline queue and every cloud write.
  scopedStorage.js  Per-user local storage.

supabase/functions/   Edge Functions (scorecard import, analysis, centers)
scripts/              Schema tooling, run by CI
schema-snapshot.csv   The live database's shape, regenerated weekly
```

**`src/domain/` is where logic belongs.** If something can be decided
without a screen, it goes there and gets tested. The components render;
they don't compute.

---

## The database

Supabase Postgres, with row-level security on every table.

**`schema-snapshot.csv` is generated, never edited.** A GitHub Action runs
`scripts/audit_schema.sql` against the live database weekly and opens a
pull request when anything has drifted. `scripts/generate_schema_sql.sql`
emits runnable DDL from the same connection.

This matters more than it sounds. A hand-maintained schema file drifted 21
columns on the `shots` table and caused two separate code reviews to report
security holes that had already been fixed, because they read the file as
though it were the database. **If a generated file is wrong, the database
is wrong, or the query is — don't patch the output.**

Setup: add `SUPABASE_DB_URL` (Project Settings → Database → connection
string, session pooler) as a repository secret.

---

## Verification

`npm test` runs the unit suite. The full harness is broader and lives
outside the repo — 23 checks covering:

- **Scoring**, verified against an independent implementation of the rules
  of bowling across 3,000 random games
- **Money**, as arithmetic: net equals gross minus cost at every level,
  season totals equal the sum of their nights
- **Damaged records** — every domain function called with the shapes a
  partial sync actually produces
- **Every component**, rendered with missing and null data
- **Real-browser suites** in Chromium with real IndexedDB: cross-account
  isolation, the sync queue, duplicate handling, stale deploys

CI additionally runs a data-flow audit and a live-schema audit, both of
which fail the build rather than printing warnings.

---

## Conventions worth knowing

**CRLF line endings**, throughout. Mixed endings break the checkers.

**Generated files are not edited by hand** — `schema-snapshot.csv`,
`schema.sql`, and the audit baselines.

**Guard for type, not truthiness.** `Array.isArray(x) ? x : []` says the
container is a list and nothing about what's in it; a single null row from
an interrupted write has taken down whole screens. Filter the elements too.

**A checker that fails on most of what it tries is usually wrong itself.**
The harness says so out loud when it happens.

---

## Diagnostics

Settings → Diagnostics → **Copy diagnostics** produces a redacted report:
crashes, failed cloud writes with their SQLSTATE, and writes that reported
success while changing nothing. Error text is redacted at record time —
Postgres puts real values in its messages, and those values are other
people's names.
