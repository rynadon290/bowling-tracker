-- ============================================================================
-- Dump the exact definitions of the 11 tables that exist in the database
-- but in no migration in this repo, so this repo can rebuild them.
--
-- Deliberately NOT reconstructed from schema-snapshot.csv. That CSV lists
-- column names and types, but not defaults, not generated-column
-- expressions, not exact numeric precision -- guessing the rest from a
-- description is exactly the mistake that got is_team_member's signature
-- wrong earlier. For 11 tables, several of them holding your actual data,
-- that risk compounds. This asks Postgres for the real thing instead.
--
-- Run each of the four queries below in the Supabase SQL editor and
-- export each result as CSV. Four files, not one -- keeping them
-- separate makes it obvious if one comes back empty (a sign that
-- something -- extension, permission -- needs attention before trusting
-- the rest).
-- ============================================================================

-- ── 1. Column definitions, exact ─────────────────────────────────────────
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  c.is_generated,
  c.generation_expression
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'arsenals','friendships','lane_patterns','leagues','matches',
    'profiles','sessions','shots','team_members','teams','user_preferences'
  )
order by c.table_name, c.ordinal_position;

-- ── 2. Constraints, exact (primary keys, foreign keys, checks, uniques) ──
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  kcu.ordinal_position,
  ccu.table_name as references_table,
  ccu.column_name as references_column,
  rc.update_rule,
  rc.delete_rule,
  cc.check_clause
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and tc.constraint_type = 'FOREIGN KEY'
left join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
left join information_schema.check_constraints cc
  on cc.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name in (
    'arsenals','friendships','lane_patterns','leagues','matches',
    'profiles','sessions','shots','team_members','teams','user_preferences'
  )
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- ── 3. Indexes, exact (the full CREATE INDEX statement) ──────────────────
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'arsenals','friendships','lane_patterns','leagues','matches',
    'profiles','sessions','shots','team_members','teams','user_preferences'
  )
order by tablename, indexname;

-- ── 4. RLS policies, exact (the full USING / WITH CHECK clauses) ─────────
select
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual as using_clause,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'arsenals','friendships','lane_patterns','leagues','matches',
    'profiles','sessions','shots','team_members','teams','user_preferences'
  )
order by tablename, policyname;
