-- READ ONLY: inspect trips RLS + compare PK lookup vs driver view for TRP001.
-- Trip from browser: 8b84f286-8ffa-429e-8ba9-1579480a0a8d

SELECT
  pol.polname AS policy_name,
  pol.polcmd AS cmd,
  pol.polpermissive AS permissive,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
  length(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) AS using_len
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'trips'
ORDER BY pol.polcmd, pol.polname;
