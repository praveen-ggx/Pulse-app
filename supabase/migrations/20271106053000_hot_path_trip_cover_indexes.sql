-- Clean-replay form of supabase/release-manual/20271106053000_hot_path_indexes_concurrent.sql.
--
-- 20271106053100 refuses to install the hub count functions unless these two
-- indexes exist with those exact definitions. The concurrent script cannot
-- live in supabase/migrations because CREATE INDEX CONCURRENTLY cannot run
-- inside the migration transaction. On an empty local database a normal
-- CREATE INDEX is the same definition. IF NOT EXISTS does not rebuild an
-- index that production already created concurrently.

SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_trips_org_count_cover
  ON public.trips USING btree (organization_id)
  INCLUDE (status, notes, pickup_date, created_at, driver_id);

CREATE INDEX IF NOT EXISTS idx_trips_org_created_cover
  ON public.trips USING btree (organization_id, created_at)
  INCLUDE (status, notes, pickup_date);
