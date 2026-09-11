-- Emits runnable DDL for the whole public schema.
--
-- Generated from the live catalog, weekly, never written by hand. The
-- previous reconstruction WAS hand-maintained: it drifted 21 columns on
-- `shots`, created an index on a column it never made, and carried
-- INSERT policies that had since been tightened. Two separate reviews
-- read it as though it were the database and reported security holes that
-- were already fixed.
--
-- So the rule this file exists to enforce: nobody edits the output. If it
-- is wrong, the database is wrong, or this query is.
--
-- SCOPE, stated plainly:
--   Included -- tables, columns, defaults, not-null, primary and foreign
--               keys, unique and check constraints, indexes, RLS, every
--               policy, and triggers.
--   NOT included -- the FUNCTIONS the triggers call (set_updated_at,
--               record_tombstone and the is_*_member helpers), because
--               their bodies live in migrations of their own; extensions;
--               and DATA. This rebuilds an empty database, not your
--               scores.
--
-- Order matters: tables, then constraints, then indexes, then RLS, then
-- policies, then triggers. A policy cannot reference a table that does
-- not exist yet.

COPY (
WITH cols AS (
  SELECT c.relname AS tbl,
         string_agg(
           '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
             || COALESCE(' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid), '')
             || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
           E',\n' ORDER BY a.attnum) AS body
  FROM pg_attribute a
  JOIN pg_class     c  ON c.oid = a.attrelid
  JOIN pg_namespace n  ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND a.attnum > 0 AND NOT a.attisdropped
  GROUP BY c.relname
)
SELECT line FROM (
  SELECT 0 AS ord, '' AS tbl, '' AS nm,
         '-- Generated from the live catalog. Do not edit by hand.' AS line
  UNION ALL
  SELECT 0, '', '~', '-- Rebuilds an EMPTY database: no data, no function bodies.'
  UNION ALL
  SELECT 0, '', '~~', ''

  -- 1. Tables
  UNION ALL
  SELECT 1, tbl, '', 'CREATE TABLE IF NOT EXISTS public.' || quote_ident(tbl) || E' (\n' || body || E'\n);'
  FROM cols

  -- 2. Constraints, primary keys first so foreign keys can land.
  UNION ALL
  SELECT 2, c.relname,
         CASE con.contype WHEN 'p' THEN '1' WHEN 'u' THEN '2' WHEN 'c' THEN '3' ELSE '4' END || con.conname,
         'ALTER TABLE public.' || quote_ident(c.relname)
           || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
           || pg_get_constraintdef(con.oid) || ';'
  FROM pg_constraint con
  JOIN pg_class     c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'

  -- 3. Indexes, skipping those a constraint already created.
  UNION ALL
  SELECT 3, i.tablename, i.indexname, i.indexdef || ';'
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_constraint con
                    JOIN pg_class c2 ON c2.oid = con.conrelid
                    WHERE c2.relname = i.tablename AND con.conname = i.indexname)

  -- 4. Row level security
  UNION ALL
  SELECT 4, c.relname, '',
         'ALTER TABLE public.' || quote_ident(c.relname) || ' ENABLE ROW LEVEL SECURITY;'
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity

  -- 5. Policies
  UNION ALL
  SELECT 5, c.relname, pol.polname,
         'CREATE POLICY ' || quote_literal(pol.polname)
           || ' ON public.' || quote_ident(c.relname)
           || ' FOR ' || CASE pol.polcmd WHEN 'a' THEN 'INSERT' WHEN 'r' THEN 'SELECT'
                                         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                                         ELSE 'ALL' END
           || ' TO ' || COALESCE((SELECT string_agg(quote_ident(r.rolname), ', ')
                                  FROM pg_roles r WHERE r.oid = ANY(pol.polroles)), 'public')
           || COALESCE(E'\n  USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', '')
           || COALESCE(E'\n  WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '')
           || ';'
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'

  -- 6. Triggers. The functions they call are NOT emitted -- see the note
  --    at the top. Running this against an empty database will fail here
  --    until those migrations are applied, which is the correct and
  --    visible failure rather than a silently incomplete rebuild.
  UNION ALL
  SELECT 6, c.relname, t.tgname, pg_get_triggerdef(t.oid) || ';'
  FROM pg_trigger t
  JOIN pg_class     c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
) s
ORDER BY ord, tbl, nm
) TO STDOUT;
