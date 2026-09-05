# Shot Tracker 🎳

A mobile-first bowling league tracker for logging shots, sessions and team stats — built for real league play across multiple teams and bowlers, with shot-by-shot detail, session summaries, team standings, and a friends leaderboard.

**Live app:** https://rynadon290.github.io/bowling-tracker/

## Features

- **Shot-by-shot logging** — ball, surface, line, result, release, miss direction, tracked per frame including full 10th-frame handling
- **Live scoring** — strict frame-by-frame scoring that only shows a running total once every bonus ball needed to resolve it is actually known
- **Session summaries** — per-night strike %, spare %, 10-pin rate, release quality, and match points (game/series win-loss vs. an opponent)
- **Team stats** — high game/series records, team averages, score consistency, "hung" tracking, and a "beat the high average bowler" weekly challenge
- **Theoretical scoring** — what a game would have scored if every makeable spare had been converted
- **Team Management** — roster with lineup order, placeholders for bowlers without an account yet, handedness, and sub status
- **Friends & leaderboard** — add friends by account, see a shared average leaderboard
- **Offline-first** — shots and sessions queue locally and sync to Supabase when back online; proxy-logging supported (one signed-in account can log for a teammate or sub)

## Tech stack

- React 18 + Vite
- Supabase (Postgres + Auth) for cloud sync and multi-device/multi-user support
- Recharts for charts
- Vitest for testing pure domain logic
- Deployed to GitHub Pages via GitHub Actions

## Local development

```bash
npm install
npm run dev
```

You'll need a `.env` file at the project root with your own Supabase project's credentials:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Both values come from **Supabase Dashboard → Project Settings → API**. Never put the `service_role`/secret key here — only the anon/publishable key is safe for client-side code.

Other commands:

```bash
npm run build      # production build
npm run preview    # preview the production build locally
npm test           # run the test suite
```

## Project structure

```
├── BowlingTracker.jsx   # main app component (Log/History/Stats/Teams/Friends views)
├── TeamManagement.jsx   # roster management, invites, placeholders
├── Friends.jsx          # friend requests + leaderboard
├── AuthProvider.jsx     # Supabase auth context
├── SignIn.jsx
├── syncQueue.js         # offline write queue + cloud sync helpers
├── supabaseClient.js
└── domain/              # pure, dependency-free business logic — no React,
    │                     no Supabase calls. Everything here takes plain
    │                     data in and returns plain data out, which is what
    │                     makes it independently testable.
    ├── scoring.js        # frame-by-frame scoring, 10th-frame rules
    ├── splits.js         # split/washout/makeable-spare detection
    ├── stats.js          # records, averages, consistency, weekly challenges
    ├── sessions.js       # session-level aggregation
    ├── leagues.js        # lineup ordering
    └── supabaseMapping.js # local <-> Supabase row shape conversion
```

Each file in `domain/` has a matching `.test.js` file. If you're adding new business logic, this is where it should live — a plain function that takes data explicitly rather than reading component state directly stays testable and reusable.

## Testing

```bash
npm test
```

Runs the full Vitest suite against everything in `domain/`, plus `Friends.jsx`, `TeamManagement.jsx`, and `syncQueue.js`. These test pure logic only — no rendering, no live Supabase calls.

## Deployment

Pushing to `main` or `team-management` triggers `.github/workflows/deploy.yml`, which:

1. Runs the test suite
2. Builds the production bundle (needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set as repo secrets — **Settings → Secrets and variables → Actions**)
3. Deploys to GitHub Pages

If dependencies change, `.github/workflows/generate-lockfile.yml` can be run manually from the Actions tab to regenerate and commit `package-lock.json` without needing a local machine — runs `npm install` in the cloud and pushes the resulting lockfile back to the repo.
