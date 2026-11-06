-- Hot-path indexes. Not a supabase/migrations file.
-- Do not run this through supabase db push. The CLI wraps migrations in a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run inside one.
--
-- Run each statement on its own, with autocommit, against production
-- nafxpivddesgsrthmosv only after the project ref is confirmed.
-- These statements do not take the write-blocking ShareLock of a normal
-- CREATE INDEX. They still scan public.trips and use CPU and disk.
-- A cancelled or disconnected build leaves an INVALID index. Do not retry
-- CREATE until that invalid index is reported and explicitly dropped.
--
-- Before creating, inspect:
--   SELECT c.relname, i.indisvalid, i.indisready, pg_get_indexdef(c.oid)
--   FROM pg_class c
--   JOIN pg_index i ON i.indexrelid = c.oid
--   JOIN pg_class t ON t.oid = i.indrelid
--   WHERE t.relname = 'trips'
--     AND c.relname IN ('idx_trips_org_count_cover', 'idx_trips_org_created_cover');
--
-- If a listed index exists and indisvalid is false, stop. After explicit
-- approval, drop only that invalid index and create it again:
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_trips_org_count_cover;
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_trips_org_created_cover;
-- Do not drop a valid index of either name.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_org_count_cover
  ON public.trips (organization_id)
  INCLUDE (status, notes, pickup_date, created_at, driver_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_org_created_cover
  ON public.trips (organization_id, created_at)
  INCLUDE (status, notes, pickup_date);
