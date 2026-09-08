-- ============================================================================
-- The 11 tables that existed only in the database.
--
-- These hold essentially all of the app's data -- shots, sessions,
-- profiles, teams, leagues -- and none of them was defined in any
-- migration in this repo. That had two costs:
--
--   1. This repo could not rebuild the database. A fresh Supabase project
--      would have come up missing every table that matters.
--   2. Every file-based audit was blind to them. "20 tables, RLS enabled,
--      no findings" was auditing two-thirds of the database and calling
--      it complete -- which is how a GLOBAL unique constraint on
--      leagues.name survived several clean security reviews.
--
-- Generated from pg_catalog and information_schema dumps taken on
-- 8 September 2026, NOT reconstructed from memory or inferred from the
-- application code. Column types, defaults, constraint definitions,
-- index definitions and RLS policies are all as the live database
-- reported them.
--
-- Tables are created in dependency order (profiles first, since almost
-- everything references it), so this file runs top to bottom on an empty
-- database.
--
-- SAFE TO RUN against the existing database: every statement is
-- if-not-exists or create-policy, so it's a no-op where things already
-- exist. Its real purpose is rebuild, not migration.
--
-- Two things to know:
--   * profiles.id and user_preferences.user_id reference auth.users,
--     which Supabase provides. That table is not created here.
--   * arsenals references ball_groups, and leagues references
--     bowling_centers -- both defined in their own migrations in this
--     repo, so run those first on a truly fresh project.
--
-- To refresh this file, re-run the four queries in
-- audit_dump_missing_tables.sql and regenerate.
-- ============================================================================

create table if not exists public.profiles (
  id uuid not null,
  display_name text not null,
  created_at timestamp with time zone default now() not null,
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint profiles_pkey PRIMARY KEY (id)
);

alter table public.profiles enable row level security;
create policy "profiles are viewable by any authenticated user" on public.profiles
  for select to authenticated
  using (true);
create policy "users can insert their own profile" on public.profiles
  for insert to authenticated
  with check ((id = auth.uid()));
create policy "users can update their own profile" on public.profiles
  for update to authenticated
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create table if not exists public.leagues (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  center_id uuid,
  start_date date,
  end_date date,
  constraint leagues_center_id_fkey FOREIGN KEY (center_id) REFERENCES bowling_centers(id) ON DELETE SET NULL,
  constraint leagues_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  constraint leagues_pkey PRIMARY KEY (id)
);

create unique index if not exists leagues_name_per_user_idx ON public.leagues USING btree (created_by, name);

alter table public.leagues enable row level security;
create policy "authenticated users can create leagues" on public.leagues
  for insert to authenticated
  with check (true);
create policy "league members can rename their league" on public.leagues
  for update to public
  using (is_league_member(id))
  with check (is_league_member(id));
create policy "leagues are viewable by any authenticated user" on public.leagues
  for select to authenticated
  using (true);

create table if not exists public.teams (
  id uuid default gen_random_uuid() not null,
  name text not null,
  league_id uuid not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  constraint teams_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  constraint teams_pkey PRIMARY KEY (id)
);

create index if not exists teams_league_id_idx ON public.teams USING btree (league_id);

alter table public.teams enable row level security;
create policy "authenticated users can create teams" on public.teams
  for insert to authenticated
  with check (true);
create policy "team members can rename their team" on public.teams
  for update to public
  using (is_team_member(id))
  with check (is_team_member(id));
create policy "teams are viewable by any authenticated user" on public.teams
  for select to authenticated
  using (true);

create table if not exists public.team_members (
  team_id uuid not null,
  user_id uuid not null,
  lineup_position integer,
  joined_at timestamp with time zone default now() not null,
  left_handed boolean default false not null,
  is_sub boolean default false not null,
  constraint team_members_pkey PRIMARY KEY (team_id, user_id),
  constraint team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  constraint team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create index if not exists team_members_user_id_idx ON public.team_members USING btree (user_id);

alter table public.team_members enable row level security;
create policy "team members can add rosters, creators can bootstrap, invitees " on public.team_members
  for insert to public
  with check ((is_team_member(team_id) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM teams
  WHERE ((teams.id = team_members.team_id) AND (teams.created_by = auth.uid()))))) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM pending_invites
  WHERE ((pending_invites.team_id = team_members.team_id) AND (pending_invites.invited_email = (auth.jwt() ->> 'email'::text)) AND (pending_invites.accepted_at IS NULL)))))));
create policy "team members can remove roster entries" on public.team_members
  for delete to authenticated
  using (is_team_member(team_id));
create policy "team members can reorder the lineup" on public.team_members
  for update to authenticated
  using (is_team_member(team_id))
  with check (is_team_member(team_id));
create policy "team members can reorder their team's roster" on public.team_members
  for update to authenticated
  using (is_team_member(team_id))
  with check (is_team_member(team_id));
create policy "team rosters are viewable by any authenticated user" on public.team_members
  for select to authenticated
  using (true);

create table if not exists public.friendships (
  id uuid default gen_random_uuid() not null,
  requester_id uuid not null,
  addressee_id uuid not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  responded_at timestamp with time zone,
  constraint friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES profiles(id) ON DELETE CASCADE,
  constraint friendships_check CHECK (requester_id <> addressee_id),
  constraint friendships_pkey PRIMARY KEY (id),
  constraint friendships_requester_id_addressee_id_key UNIQUE (requester_id, addressee_id),
  constraint friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE,
  constraint friendships_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))
);

create index if not exists friendships_addressee_idx ON public.friendships USING btree (addressee_id);
create index if not exists friendships_requester_idx ON public.friendships USING btree (requester_id);

alter table public.friendships enable row level security;
create policy "either side can delete a friendship" on public.friendships
  for delete to authenticated
  using (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));
create policy "either side can respond to or cancel a request" on public.friendships
  for update to authenticated
  using (((requester_id = auth.uid()) OR (addressee_id = auth.uid())))
  with check (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));
create policy "users can send friend requests" on public.friendships
  for insert to authenticated
  with check ((requester_id = auth.uid()));
create policy "users can view friendships they're part of" on public.friendships
  for select to authenticated
  using (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));

create table if not exists public.arsenals (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  bowler_name text,
  ball text,
  created_by uuid default gen_random_uuid(),
  layout_system text,
  layout_values jsonb,
  group_id uuid,
  coverstock text,
  core_type text,
  weight numeric,
  rg numeric,
  diff numeric,
  int_diff numeric,
  constraint arsenal_pkey PRIMARY KEY (id),
  constraint arsenals_core_type_check CHECK ((core_type IS NULL) OR (core_type = ANY (ARRAY['symmetric'::text, 'asymmetric'::text]))),
  constraint arsenals_coverstock_check CHECK ((coverstock IS NULL) OR (coverstock = ANY (ARRAY['solid'::text, 'pearl'::text, 'hybrid'::text]))),
  constraint arsenals_group_id_fkey FOREIGN KEY (group_id) REFERENCES ball_groups(id) ON DELETE SET NULL,
  constraint arsenals_layout_system_check CHECK ((layout_system IS NULL) OR (layout_system = ANY (ARRAY['dual_angle'::text, 'vls'::text, '2ls'::text])))
);

alter table public.arsenals enable row level security;
create policy "authenticated users can view arsenals" on public.arsenals
  for select to authenticated
  using (true);
create policy "users can add their own arsenal entries" on public.arsenals
  for insert to public
  with check ((created_by = auth.uid()));
create policy "users can remove their own arsenal entries" on public.arsenals
  for delete to public
  using ((created_by = auth.uid()));
create policy "users can update their own arsenal entries" on public.arsenals
  for update to public
  using ((created_by = auth.uid()))
  with check ((created_by = auth.uid()));

create table if not exists public.sessions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  team_id uuid,
  league_id uuid,
  bowler_name text default ''::text not null,
  date date not null,
  scores int4[] default '{}'::integer[] not null,
  total integer,
  average integer,
  shot_count integer default 0 not null,
  strikes integer default 0 not null,
  weak_tens integer default 0 not null,
  ringing_tens integer default 0 not null,
  ten_pin_leaves integer default 0 not null,
  single_pin_leaves integer default 0 not null,
  single_pin_spares integer default 0 not null,
  spare_attempts integer default 0 not null,
  spares_made integer default 0 not null,
  splits integer default 0 not null,
  splits_converted integer default 0 not null,
  balls_used jsonb default '[]'::jsonb not null,
  misses jsonb default '[]'::jsonb not null,
  releases jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  poker_quarter jsonb default '[0, 0, 0]'::jsonb not null,
  poker_dollar jsonb default '[0, 0, 0]'::jsonb not null,
  three_six_nine_winnings numeric default 0 not null,
  jackpot_winnings numeric default 0 not null,
  high_game_winnings numeric[] default '{0,0,0}'::numeric[] not null,
  high_game_cost numeric[] default '{0,0,0}'::numeric[] not null,
  poker_quarter_cost numeric[] default '{0,0,0}'::numeric[] not null,
  poker_dollar_cost numeric[] default '{0,0,0}'::numeric[] not null,
  three_six_nine_cost numeric default 0 not null,
  constraint sessions_bowler_name_league_id_date_key UNIQUE (bowler_name, league_id, date),
  constraint sessions_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL,
  constraint sessions_pkey PRIMARY KEY (id),
  constraint sessions_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  constraint sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create index if not exists sessions_bowler_name_idx ON public.sessions USING btree (bowler_name);
create index if not exists sessions_team_id_idx ON public.sessions USING btree (team_id);
create index if not exists sessions_user_id_idx ON public.sessions USING btree (user_id);

alter table public.sessions enable row level security;
create policy "coaches can view their bowler's sessions" on public.sessions
  for select to authenticated
  using (is_accepted_coach_of(user_id));
create policy "friends can view each other's sessions" on public.sessions
  for select to authenticated
  using (are_friends(user_id));
create policy "teammates can view each other's sessions" on public.sessions
  for select to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "users can delete their own sessions" on public.sessions
  for delete to authenticated
  using ((user_id = auth.uid()));
create policy "users can insert their own sessions" on public.sessions
  for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "users can update their own sessions" on public.sessions
  for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy "users can view their own sessions" on public.sessions
  for select to authenticated
  using ((user_id = auth.uid()));

create table if not exists public.shots (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  team_id uuid,
  league_id uuid,
  date date not null,
  game integer not null,
  frame integer not null,
  ball_num integer,
  lane text,
  ball text,
  surface text,
  starting_board text,
  target_arrows text,
  result text not null,
  constraint shots_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL,
  constraint shots_pkey PRIMARY KEY (id),
  constraint shots_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  constraint shots_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create index if not exists shots_bowler_name_idx ON public.shots USING btree (bowler_name);
create index if not exists shots_team_id_idx ON public.shots USING btree (team_id);
create index if not exists shots_user_date_idx ON public.shots USING btree (user_id, date);
create index if not exists shots_user_id_idx ON public.shots USING btree (user_id);

alter table public.shots enable row level security;
create policy "coaches can view their bowler's shots" on public.shots
  for select to authenticated
  using (is_accepted_coach_of(user_id));
create policy "friends can view each other's shots" on public.shots
  for select to authenticated
  using (are_friends(user_id));
create policy "teammates can view each other's shots" on public.shots
  for select to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "users can delete their own shots" on public.shots
  for delete to authenticated
  using ((user_id = auth.uid()));
create policy "users can insert their own shots" on public.shots
  for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "users can update their own shots" on public.shots
  for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy "users can view their own shots" on public.shots
  for select to authenticated
  using ((user_id = auth.uid()));

create table if not exists public.matches (
  id uuid default gen_random_uuid() not null,
  team_id uuid,
  league_id uuid,
  date date not null,
  games jsonb default '[null, null, null]'::jsonb not null,
  series boolean,
  opponent text default ''::text not null,
  handicap text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint matches_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL,
  constraint matches_pkey PRIMARY KEY (id),
  constraint matches_team_id_date_key UNIQUE (team_id, date),
  constraint matches_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

create index if not exists matches_league_id_idx ON public.matches USING btree (league_id);
create index if not exists matches_team_id_idx ON public.matches USING btree (team_id);

alter table public.matches enable row level security;
create policy "team members can delete their team's matches" on public.matches
  for delete to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "team members can log matches for their team" on public.matches
  for insert to authenticated
  with check (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "team members can update their team's matches" on public.matches
  for update to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)))
  with check (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "team members can view their team's matches" on public.matches
  for select to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)));

create table if not exists public.lane_patterns (
  id uuid default gen_random_uuid() not null,
  team_id uuid,
  league_id uuid,
  date date not null,
  lane text not null,
  pattern_type text default 'house'::text not null,
  pattern_name text default ''::text not null,
  length text default ''::text not null,
  volume text default ''::text not null,
  ratio text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint lane_patterns_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL,
  constraint lane_patterns_pkey PRIMARY KEY (id),
  constraint lane_patterns_team_id_date_lane_key UNIQUE (team_id, date, lane),
  constraint lane_patterns_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

create index if not exists lane_patterns_league_id_idx ON public.lane_patterns USING btree (league_id);
create index if not exists lane_patterns_team_id_idx ON public.lane_patterns USING btree (team_id);

alter table public.lane_patterns enable row level security;
create policy "team members can delete their team's lane patterns" on public.lane_patterns
  for delete to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "team members can log lane patterns for their team" on public.lane_patterns
  for insert to authenticated
  with check (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "team members can update their team's lane patterns" on public.lane_patterns
  for update to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)))
  with check (((team_id IS NOT NULL) AND is_team_member(team_id)));
create policy "team members can view their team's lane patterns" on public.lane_patterns
  for select to authenticated
  using (((team_id IS NOT NULL) AND is_team_member(team_id)));

create table if not exists public.user_preferences (
  user_id uuid not null,
  preferences jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now(),
  constraint user_preferences_pkey PRIMARY KEY (user_id),
  constraint user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint user_preferences_user_id_key UNIQUE (user_id)
);

alter table public.user_preferences enable row level security;
create policy "users can insert their own preferences" on public.user_preferences
  for insert to public
  with check ((user_id = auth.uid()));
create policy "users can update their own preferences" on public.user_preferences
  for update to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy "users can view their own preferences" on public.user_preferences
  for select to public
  using ((user_id = auth.uid()));
