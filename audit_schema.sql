-- ============================================================================
-- Dump the LIVE schema, so audits can run against reality.
--
-- Every schema audit so far has read the .sql files in this repo, which
-- silently miss anything created directly in the dashboard. That's how a
-- global unique constraint on leagues.name went unnoticed through
-- multiple "all clear" security reviews: the leagues table isn't defined
-- in any migration here, so nothing I could grep knew it existed.
--
-- Run this, export the result as CSV, and drop it in the repo as
-- schema-snapshot.csv. Then audits check the database instead of my
-- assumptions about it.
--
-- Re-run it after any dashboard change.
-- ============================================================================

select
  'column' as kind,
  c.table_name as object_name,
  c.column_name as detail,
  c.data_type || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end as extra
from information_schema.columns c
where c.table_schema = 'public'

union all

select
  'constraint',
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type || ' (' || coalesce(string_agg(kcu.column_name, ',' order by kcu.ordinal_position), '') || ')'
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
where tc.table_schema = 'public'
group by tc.table_name, tc.constraint_name, tc.constraint_type

union all

select
  'index',
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'

union all

select
  'policy',
  tablename,
  policyname,
  cmd || ' :: ' || coalesce(qual, 'no using') 
from pg_policies
where schemaname = 'public'

union all

select
  'rls',
  c.relname,
  case when c.relrowsecurity then 'enabled' else 'DISABLED' end,
  ''
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'

union all

select
  'function',
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  case when p.prosecdef then 'security definer' else 'invoker' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

order by kind, object_name, detail;
