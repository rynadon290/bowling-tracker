Bowling Tracker

A personal bowling tracking and analytics app built with React and Vite. It records detailed bowling data and turns it into bowling, session, team, league, and performance analytics.

What it does

Shot-by-shot logging

- Record individual shots by bowler, league, date, game, frame, and ball.
- Track ball, surface, starting board, target arrows, result, leave, spare result, release, miss, ball-change reason, pin count, and notes.
- Supports explicit 10th-frame scoring, including bonus balls after strikes and spares.
- Historical shot data remains available even when a ball is removed from a bowler's current arsenal.

Session tracking

Save bowling sessions with:

- Three-game scores
- Series and average
- Strikes
- Spare attempts and makes
- Weak/ringing tens
- 10-pin leaves and conversions
- Single-pin leaves
- Splits and split conversions
- Balls used
- Misses and releases
- Shot-derived statistics

Session history can be filtered by bowler and league.

Bowling analytics

The Stats view provides analytics including:

- Strike and spare performance
- 10-pin and single-pin spare performance
- Split rate and split conversion
- Clean-frame rate
- First-ball average and leave average
- Frame-position performance
- Ball-by-ball comparisons
- High game and high series
- Recurring split and non-split leave breakdowns
- Comparisons against other bowlers and team/league data

Shot data is kept separate from derived statistics so the same underlying data can support multiple views and analyses.

Leagues and teams

The app supports multiple leagues independently.

You can:

- Create, rename, and delete teams
- Maintain separate rosters for different leagues
- Assign lineup positions
- Reorder team members
- Add teammates
- Invite teammates
- Create name-only roster placeholders
- Resolve placeholders to registered users
- Associate bowling data with the appropriate league and team

League identity and team identity are kept separate so a bowler can participate in multiple leagues with different teams.

League-night information

Tonight's Session is the central place for information that applies to the entire bowling night.

It includes:

- League
- Date
- Opponent
- Team handicap
- Starting lane
- Lane pair
- Lane conditions / oil pattern
- Points won for each game
- Total points and pinfall information

Opponent and handicap are entered once for the night rather than being duplicated for every bowler or shot.

Historical team and league statistics can then use this information to show things such as:

- Win/loss record against opponents
- Performance against teams with different handicap levels
- Team and league results over time

Friends and leaderboard

The app includes social features for comparing bowling performance with other registered users.

Users can:

- Search for other users by display name
- Send friend requests
- Accept or decline requests
- Cancel pending requests
- Remove friends
- View friend leaderboard/session averages

Cloud synchronization and offline support

The app uses Supabase for authenticated cloud data and IndexedDB for local persistence and queued writes.

The synchronization architecture is designed to support unreliable connectivity:

- Cloud-first reads with local fallback
- Failed/unconfirmed writes can be queued locally
- Queued writes can be retried when connectivity returns
- Pending-sync counts are exposed in the UI
- Sync diagnostics are available for troubleshooting
- JSON export/backup provides an independent backup mechanism

Browser-local data remains important for offline operation. Cloud synchronization should not be considered a substitute for backups.

Architecture

The application separates the UI from reusable domain logic where practical.

src/
├── BowlingTracker.jsx          Main application and views
├── TeamManagement.jsx          Team and roster management
├── Friends.jsx                 Friends and leaderboard
├── AuthProvider.jsx            Supabase authentication and profile
├── syncQueue.js                Cloud synchronization and offline queue
├── supabaseClient.js           Supabase client configuration
└── domain/
    ├── scoring.js              Bowling scoring and 10th-frame logic
    ├── splits.js               Split and leave classification
    ├── sessions.js             Session statistics and shot lookup
    ├── leagues.js              League and lineup helpers
    └── supabaseMapping.js      Local ↔ Supabase data mapping

Keeping deterministic bowling logic in separate domain modules makes it easier to test and reduces the amount of business logic inside the main React component.

Data model

The application uses a combination of local browser data and Supabase cloud data.

Important concepts include:

- User/Profile — authenticated user and display name
- League — bowling league identity
- Team — roster belonging to a league
- Team member — user or roster member assigned to a team and lineup position
- Pending invite — teammate invitation or roster placeholder
- Shot — one logged delivery
- Session — one bowler's bowling-night record
- Match — opponent, handicap, and league-night result information
- Lane pattern — lane and oil-pattern information
- Friendship — connection between users
- Pending write — cloud operation waiting for synchronization

The client maps between its JavaScript camelCase objects and the Supabase snake_case database representation.

Authentication

Authentication is handled through Supabase Auth.

The browser uses the public Supabase client credentials supplied through Vite environment variables. Secret/service-role credentials must never be included in the client application.

Create a local ".env" file containing:

VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key

Do not commit ".env" or any secret/service-role key to the repository.

Local development

Install dependencies:

npm install

Start the Vite development server:

npm run dev

Build the production application:

npm run build

Preview the production build:

npm run preview

Tests

The project uses Vitest for automated testing.

Run the test suite with:

npm test

Tests currently cover important deterministic and integration-adjacent areas including:

- Bowling scoring
- 10th-frame state transitions
- Split and leave classification
- Session statistics
- Shot lookup
- League helpers
- Local/Supabase data mapping
- Offline synchronization queue behavior
- Team roster operations
- Team invitations and placeholders
- Friends/leaderboard logic

The automated suite is intentionally focused on deterministic application logic. Full browser end-to-end testing is a future layer.

Deployment

The application is configured for deployment to GitHub Pages through GitHub Actions.

The deployment workflow builds the Vite production bundle and publishes the resulting "dist/" directory.

The production build uses the configured Supabase URL and public client key supplied through the repository's GitHub Actions configuration.

Design principles

Shot data is the source of truth

Detailed shot records provide the foundation for bowling analytics. Statistics should be derived from the underlying bowling data rather than requiring the same information to be entered repeatedly.

Enter shared information once

Information that applies to an entire league night belongs at the session/night level.

For example, the opponent and team handicap are properties of the night's matchup, not individual bowlers. They are therefore entered once and reused by team and league statistics.

10th-frame scoring is explicit

Frame 10 is treated differently from frames 1–9 because additional balls may be available after strikes and spares.

Ball numbers and frame-10 state are explicitly represented so bonus-ball input cannot accidentally be confused with another frame, game, bowler, or night's data.

League and team identity are separate

A bowler can participate in multiple leagues and different teams. Team-specific data should therefore use the team's identity when one is known rather than assuming that a league name uniquely identifies a team.

Offline writes should be recoverable

A cloud write that cannot be confirmed should not simply disappear. The synchronization system retains pending operations locally so they can be retried.

Historical data should remain stable

Changing a current ball arsenal, team roster, or UI selection should not erase historical bowling data or invalidate previously recorded sessions.

Current hardening areas

The application is functional, but the multi-user/cloud architecture continues to be hardened.

Areas receiving particular attention include:

- Safely distinguishing full-row cloud upserts from partial updates
- Ensuring targeted synchronization repairs cannot affect unrelated queued writes
- Strengthening server-side authorization for team/invite claiming and roster linking
- Converting remaining legacy compatibility behavior into explicit migrations
- Ensuring team-specific operations consistently use team IDs
- Handling multiple teams within the same league
- Adding browser-level end-to-end coverage

These are architecture and reliability improvements rather than reasons to duplicate bowling information in multiple places.

Backup

Use the app's JSON export/backup feature regularly, particularly before major roster, league, or data changes.

Cloud synchronization and browser persistence are designed to work together, but an independent export remains the safest portable backup of the bowling data.
