-- Allow an org member to revise a POD debit-control validation event in place.
-- POD validation uses this so a confirmed trip's charges can be edited
-- (same idempotency key) instead of inserting a second validation row.
-- Scoped to event_type = 'pod.debit_control_validated' so other workflow
-- events stay append-only.

DROP POLICY IF EXISTS "trip_workflow_org_update" ON public.trip_workflow_events;

CREATE POLICY "trip_workflow_org_update"
  ON public.trip_workflow_events FOR UPDATE
  USING (
    event_type = 'pod.debit_control_validated'
    AND org_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    event_type = 'pod.debit_control_validated'
    AND org_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
