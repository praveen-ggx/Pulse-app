-- Assigned drivers (and others who can SELECT the linked trip) must be able to
-- INSERT ocr_jobs for odometer / expense / POD scans. 20270912190000 narrowed
-- INSERT WITH CHECK to is_org_member only for perf — that blocks drivers who
-- are not organization_members, causing:
--   "new row violates row-level security policy for table 'ocr_jobs'"
--
-- Restore the trip-linked branch on INSERT only. Org staff still pass via
-- is_org_member (no trips RLS). Drivers pass when they can SELECT the trip.
-- SELECT / UPDATE / DELETE policies are unchanged.

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS "ocr_jobs_trip_access_insert" ON public.ocr_jobs;

CREATE POLICY "ocr_jobs_trip_access_insert"
  ON public.ocr_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ocr_jobs.trip_id)
    )
  );
