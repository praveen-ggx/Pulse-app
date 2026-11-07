SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '1026422b-a509-4c87-b498-30316b68dc63',
    'role', 'authenticated'
  )::text,
  true
);

SET ROLE authenticated;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  ses.trip_id,
  ses.stop_id,
  ses.sequence,
  ses.status,
  ses.driver_id,
  ses.arrived_at,
  ses.completed_at,
  ses.skip_reason,
  ses.failure_reason,
  eps.id,
  eps.stop_type,
  eps.display_name,
  eps.label,
  eps.address_line,
  eps.city,
  eps.state,
  eps.pincode,
  eps.latitude,
  eps.longitude,
  eps.contact_name,
  eps.contact_phone,
  eps.pod_required
FROM public.stop_execution_state ses
LEFT JOIN public.execution_plan_stops eps
  ON eps.id = ses.stop_id
WHERE ses.trip_id = '3f333e5b-1256-4208-acee-7de3bc305f0b'::uuid;
