CREATE TABLE rpc_results (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);
GRANT INSERT ON rpc_results TO authenticated;

CREATE OR REPLACE FUNCTION rpc_expect(p_name text, p_sql text, p_err text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_sqlstate text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO rpc_results VALUES (p_name, false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    INSERT INTO rpc_results VALUES (
      p_name,
      v_sqlstate = '42501' AND v_message = p_err,
      v_sqlstate || ' ' || v_message
    );
  END;
END;
$$;

INSERT INTO public.organization_members (id, organization_id, user_id, role, status, permissions) VALUES
  ('00000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'member', 'active', '{"platformRole":"tripops"}'),
  ('00000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 'owner', 'active', '{}'),
  ('00000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000003', 'member', 'active', '{"platformRole":"admin"}'),
  ('00000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000004', 'member', 'active', '{"platformRole":"ground_ops"}'),
  ('00000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000005', 'owner', 'active', '{}'),
  ('00000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000006', 'member', 'inactive', '{"platformRole":"tripops"}');

INSERT INTO public.profiles (id, full_name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Trip Ops'),
  ('20000000-0000-0000-0000-000000000002', 'Owner'),
  ('20000000-0000-0000-0000-000000000003', 'Platform Admin'),
  ('20000000-0000-0000-0000-000000000004', 'Ground Ops'),
  ('20000000-0000-0000-0000-000000000005', 'Other Org'),
  ('20000000-0000-0000-0000-000000000006', 'Inactive');

INSERT INTO public.trips (id, organization_id, status, source, indent_id, supplier_id) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'completed', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'delivered', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'done', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a', 'at_drop', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', 'in_transit', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000a', 'assigned', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-00000000000a', 'in_progress', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-00000000000a', 'assigned', 'market_bid', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000a', 'Completed', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'assigned', 'manual', NULL, NULL),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'in_transit', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');

INSERT INTO public.trip_conversations (id, organization_id, trip_id)
SELECT ('60000000-0000-0000-0000-' || substr(t.id::text, 25))::uuid, t.organization_id, t.id
FROM public.trips t;

-- Direct trigger path, same database, not via the RPC.
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
SELECT rpc_expect(
  'direct tripops revoke completed',
  $$UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  'trip_revoke_delivered_owner_only'
);

-- RPC path. The function is SECURITY DEFINER, so the trigger does not decide these.
SELECT rpc_expect(
  'rpc tripops revoke completed',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-00000000000a',
      'at_drop',
      '20000000-0000-0000-0000-000000000002',
      'Owner')$$,
  'trip_revoke_delivered_owner_only'
);
SELECT rpc_expect(
  'rpc tripops revoke delivered',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-00000000000a',
      'in_transit',
      NULL,
      'Dispatcher')$$,
  'trip_revoke_delivered_owner_only'
);
SELECT rpc_expect(
  'rpc tripops revoke done',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-00000000000a',
      'at_drop',
      NULL,
      'Dispatcher')$$,
  'trip_revoke_delivered_owner_only'
);
SELECT rpc_expect(
  'rpc tripops revoke Completed',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000009',
      '10000000-0000-0000-0000-00000000000a',
      'in_progress',
      NULL,
      'Dispatcher')$$,
  'trip_revoke_delivered_owner_only'
);
SELECT rpc_expect(
  'rpc tripops integrated cancel',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000006',
      '10000000-0000-0000-0000-00000000000a',
      'cancelled',
      NULL,
      'Dispatcher')$$,
  'trip_cancel_owner_only'
);
SELECT rpc_expect(
  'rpc tripops cancel after pickup',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000007',
      '10000000-0000-0000-0000-00000000000a',
      'canceled',
      NULL,
      'Dispatcher')$$,
  'trip_cancel_not_eligible'
);

SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-00000000000a',
  'completed',
  NULL,
  'Spoofed Owner'
);
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-00000000000a',
  'in_progress',
  NULL,
  'Dispatcher'
);
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-000000000008',
  '10000000-0000-0000-0000-00000000000a',
  'cancelled',
  NULL,
  'Dispatcher'
);
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-00000000000a',
  'in_progress',
  NULL,
  'Dispatcher'
);

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-00000000000a',
  'at_drop',
  '20000000-0000-0000-0000-000000000001',
  'Trip Ops'
);
SELECT rpc_expect(
  'rpc owner cancel after pickup',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000007',
      '10000000-0000-0000-0000-00000000000a',
      'cancelled',
      NULL,
      'Owner')$$,
  'trip_cancel_not_eligible'
);
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-00000000000a',
  'cancelled',
  NULL,
  'Owner'
);

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000003';
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-00000000000a',
  'in_transit',
  NULL,
  'Dispatcher'
);

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000004';
SELECT rpc_expect(
  'rpc ground ops revoke done',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-00000000000a',
      'at_drop',
      NULL,
      'Dispatcher')$$,
  'trip_revoke_delivered_owner_only'
);
SELECT public.change_trip_status_with_notification(
  '30000000-0000-0000-0000-00000000000b',
  '10000000-0000-0000-0000-00000000000a',
  'at_drop',
  NULL,
  'Dispatcher'
);

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000005';
SELECT rpc_expect(
  'rpc cross org revoke',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-000000000009',
      '10000000-0000-0000-0000-00000000000a',
      'at_drop',
      NULL,
      'Owner')$$,
  'trip_not_found: 30000000-0000-0000-0000-000000000009'
);

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000006';
SELECT rpc_expect(
  'rpc inactive member simulate',
  $$SELECT public.change_trip_status_with_notification(
      '30000000-0000-0000-0000-00000000000b',
      '10000000-0000-0000-0000-00000000000a',
      'completed',
      NULL,
      'Dispatcher')$$,
  'trip_not_found: 30000000-0000-0000-0000-00000000000b'
);

RESET ROLE;

INSERT INTO rpc_results
SELECT 'status ' || t.id::text, t.status = expected.expected, t.status
FROM (VALUES
  ('30000000-0000-0000-0000-000000000001', 'at_drop'),
  ('30000000-0000-0000-0000-000000000002', 'in_transit'),
  ('30000000-0000-0000-0000-000000000003', 'done'),
  ('30000000-0000-0000-0000-000000000004', 'completed'),
  ('30000000-0000-0000-0000-000000000005', 'in_progress'),
  ('30000000-0000-0000-0000-000000000006', 'cancelled'),
  ('30000000-0000-0000-0000-000000000007', 'in_progress'),
  ('30000000-0000-0000-0000-000000000008', 'cancelled'),
  ('30000000-0000-0000-0000-000000000009', 'Completed'),
  ('30000000-0000-0000-0000-00000000000a', 'in_progress'),
  ('30000000-0000-0000-0000-00000000000b', 'at_drop')
) AS expected(id, expected)
JOIN public.trips t ON t.id = expected.id::uuid;

INSERT INTO rpc_results
SELECT 'messages ' || t.id::text,
       (SELECT count(*) FROM public.trip_messages m
         JOIN public.trip_conversations c ON c.id = m.conversation_id
        WHERE c.trip_id = t.id) = expected_count,
       (SELECT count(*)::text FROM public.trip_messages m
         JOIN public.trip_conversations c ON c.id = m.conversation_id
        WHERE c.trip_id = t.id)
FROM (VALUES
  ('30000000-0000-0000-0000-000000000001', 1),
  ('30000000-0000-0000-0000-000000000002', 1),
  ('30000000-0000-0000-0000-000000000003', 0),
  ('30000000-0000-0000-0000-000000000004', 1),
  ('30000000-0000-0000-0000-000000000005', 1),
  ('30000000-0000-0000-0000-000000000006', 1),
  ('30000000-0000-0000-0000-000000000007', 0),
  ('30000000-0000-0000-0000-000000000008', 1),
  ('30000000-0000-0000-0000-000000000009', 0),
  ('30000000-0000-0000-0000-00000000000a', 1),
  ('30000000-0000-0000-0000-00000000000b', 1)
) AS expected(id, expected_count)
JOIN public.trips t ON t.id = expected.id::uuid;

SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, detail FROM rpc_results ORDER BY name;
