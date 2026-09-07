-- ============================================================================
-- Tournament side action and match play.
--
-- Two additions to the existing tournaments table:
--
--   side_pots  - itemised brackets, eliminators, and pots. The main entry
--                stays in buy_in / winnings; this is everything alongside
--                it, one object per entry so a season's worth of "do
--                brackets actually pay for themselves" is answerable.
--
--   match_play - the head-to-head phase after the cut: the matches, and
--                the bonus-pin values in force at THIS tournament. Bonus
--                is stored per tournament rather than as a global setting
--                because it genuinely varies by event -- 30 pins per win
--                is common but far from universal.
--
-- Both are jsonb for the same reason `days` already is: the shape will
-- keep growing, and the app validates against domain/sidePots.js and
-- domain/matchPlay.js before writing, so the blob is never arbitrary.
--
-- Defaults matter here. Existing tournament rows predate both columns;
-- defaulting to an empty array and an empty object means every old row
-- loads as "no side action, no match play" rather than null-checking at
-- every read site.
-- ============================================================================

alter table public.tournaments
  add column if not exists side_pots jsonb not null default '[]'::jsonb,
  add column if not exists match_play jsonb not null default '{}'::jsonb;

-- No RLS changes needed: these are columns on a table whose policies
-- already scope every operation to the owning user, and column additions
-- inherit them. Re-granting anyway would be a no-op, and dropping and
-- recreating the policies would risk a window where they don't exist.

-- PostgREST caches the table shape. Without this the app gets
-- PGRST204 ("could not find the column in the schema cache") on the first
-- write after the migration, even though the column is really there.
notify pgrst, 'reload schema';
