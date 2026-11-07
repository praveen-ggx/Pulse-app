SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '1026422b-a509-4c87-b498-30316b68dc63',
    'role', 'authenticated'
  )::text,
  true
);

SELECT count(*) AS primitive_a_rows
FROM public.get_driver_trip_stop_orders('3f333e5b-1256-4208-acee-7de3bc305f0b'::uuid);
