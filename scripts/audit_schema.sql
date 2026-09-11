-- Emits schema-snapshot.csv, exactly the shape the audits already read.
--
-- The same query that was being run by hand in the Supabase editor, moved
-- into the repo so CI can run it on a schedule instead. Six kinds, one
-- union, one ORDER BY -- the audits parse on `kind`, so the column names
-- and order must not change.
--
-- Triggers are included, which the hand-run version did NOT capture. That
-- omission is why two separate reviews concluded delta sync had never
-- been installed: the snapshot could not show the four triggers that were
-- there all along.

COPY (
  SELECT kind, object_name, detail, extra FROM (

    SELECT 'column' AS kind, c.relname AS object_name, a.attname AS detail,
           format_type(a.atttypid, a.atttypmod)
             || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END AS extra
    FROM pg_attribute a
    JOIN pg_class     c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped

    UNION ALL
    SELECT 'constraint', c.relname, con.conname, pg_get_constraintdef(con.oid)
    FROM pg_constraint con
    JOIN pg_class     c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'

    UNION ALL
    SELECT 'index', tablename, indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public'

    UNION ALL
    -- One line per policy, in the ':: ' form the audits already split on.
    SELECT 'policy', c.relname, pol.polname,
           CASE pol.polcmd WHEN 'a' THEN 'INSERT' WHEN 'r' THEN 'SELECT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                           ELSE 'ALL' END
           || ' :: ' || COALESCE('using ' || pg_get_expr(pol.polqual, pol.polrelid), 'no using')
           || ' :: ' || COALESCE('check ' || pg_get_expr(pol.polwithcheck, pol.polrelid), 'check none')
           || ' :: to ' || COALESCE((SELECT string_agg(r.rolname, ',')
                                     FROM pg_roles r WHERE r.oid = ANY(pol.polroles)), 'public')
    FROM pg_policy pol
    JOIN pg_class     c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'

    UNION ALL
    SELECT 'rls', c.relname, CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'DISABLED' END, ''
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'

    UNION ALL
    SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace

    UNION ALL
    -- NEW. Triggers were never captured, and their absence from the
    -- snapshot was read twice as their absence from the database.
    SELECT 'trigger', c.relname, t.tgname, p.proname
    FROM pg_trigger t
    JOIN pg_class     c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc      p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public' AND NOT t.tgisinternal

  ) s
  ORDER BY kind, object_name, detail
) TO STDOUT WITH CSV HEADER;
