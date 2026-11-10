CREATE TABLE closure_results (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);
GRANT INSERT ON closure_results TO authenticated, service_role;

CREATE OR REPLACE FUNCTION closure_expect(p_name text, p_sql text, p_state text, p_err text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO closure_results VALUES (p_name, false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    INSERT INTO closure_results VALUES (
      p_name,
      v_state = p_state AND v_message = p_err,
      v_state || ' ' || v_message
    );
  END;
END;
$$;

INSERT INTO public.organization_members (id, organization_id, user_id, role, status, permissions) VALUES
  ('00000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'member', 'active', '{"platformRole":"tripops"}'),
  ('00000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 'owner', 'active', '{}'),
  ('00000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000003', 'member', 'active', '{"platformRole":"admin"}'),
  ('00000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000004', 'member', 'inactive', '{"platformRole":"tripops"}'),
  ('00000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000005', 'owner', 'active', '{}'),
  ('00000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000006', 'member', 'active', '{}');

INSERT INTO public.profiles (id, full_name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Trip Ops'),
  ('20000000-0000-0000-0000-000000000002', 'Owner'),
  ('20000000-0000-0000-0000-000000000003', 'Platform Admin'),
  ('20000000-0000-0000-0000-000000000006', 'Supplier');

INSERT INTO public.suppliers (id, linked_organization_id) VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b');

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
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'in_transit', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', 'completed', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000a', 'assigned', 'manual', NULL, NULL),
  ('30000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-00000000000a', 'completed', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-00000000000a', 'in_transit', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');

INSERT INTO public.trip_conversations (id, organization_id, trip_id, party_type)
SELECT ('60000000-0000-0000-0000-' || substr(t.id::text, 25))::uuid,
       t.organization_id, t.id, 'client'
FROM public.trips t;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

SELECT closure_expect('direct revoke',
  $$UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', 'trip_revoke_delivered_owner_only');
SELECT closure_expect('direct integrated cancel',
  $$UPDATE public.trips SET status = 'cancelled' WHERE id = '30000000-0000-0000-0000-000000000006'$$,
  '42501', 'trip_cancel_owner_only');
SELECT closure_expect('chat integrated cancel',
  $$SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-00000000000a','cancelled',NULL,'Dispatcher')$$,
  '42501', 'trip_cancel_owner_only');
SELECT closure_expect('direct cancel after pickup',
  $$UPDATE public.trips SET status = 'cancelled' WHERE id = '30000000-0000-0000-0000-000000000007'$$,
  '42501', 'trip_cancel_not_eligible');
UPDATE public.trips SET status = 'in_progress' WHERE id = '30000000-0000-0000-0000-000000000005';
UPDATE public.trips SET status = 'cancelled' WHERE id = '30000000-0000-0000-0000-000000000008';

SELECT closure_expect('chat revoke',
  $$SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a','at_drop','20000000-0000-0000-0000-000000000002','Owner')$$,
  '42501', 'trip_revoke_delivered_owner_only');
SELECT closure_expect('chat Completed revoke',
  $$SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-00000000000a','in_progress',NULL,'Dispatcher')$$,
  '42501', 'trip_revoke_delivered_owner_only');
SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-00000000000a','completed',NULL,'Dispatcher');

SELECT closure_expect('submit revoke spoofed owner',
  $$SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000002','status_change','revoke','{}','at_drop','20000000-0000-0000-0000-000000000002','Owner',NULL)$$,
  '42501', 'trip_revoke_delivered_owner_only');
SELECT closure_expect('submit integrated cancel',
  $$SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000006','status_change','cancel','{}','cancelled',NULL,'Dispatcher',NULL)$$,
  '42501', 'trip_cancel_owner_only');
SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','status_change','advance','{}','in_progress',NULL,'Dispatcher',NULL);

SELECT closure_expect('b2b revoke done',
  $$SELECT public.process_b2b_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000003','status_change','{"new_status":"at_drop","user_id":"20000000-0000-0000-0000-000000000002","user_name":"Owner"}'::jsonb)$$,
  '42501', 'trip_revoke_delivered_owner_only');
SELECT closure_expect('b2b cancel after pickup',
  $$SELECT public.process_b2b_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000007','status_change','{"new_status":"canceled"}'::jsonb)$$,
  '42501', 'trip_cancel_not_eligible');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);
SELECT public.change_trip_status_with_notification('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a','at_drop',NULL,'Owner');
SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000006','status_change','cancel','{}','cancelled',NULL,'Owner',NULL);
SELECT closure_expect('owner b2b cancel after pickup',
  $$SELECT public.process_b2b_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000007','status_change','{"new_status":"cancelled"}'::jsonb)$$,
  '42501', 'trip_cancel_not_eligible');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', false);
SELECT public.process_b2b_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000003','status_change','{"new_status":"at_drop"}'::jsonb);

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', false);
SELECT public.process_b2b_event('10000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','status_change','{"new_status":"at_drop"}'::jsonb);
SELECT closure_expect('supplier revoke delivered',
  $$SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-000000000002','status_change','revoke','{}','in_transit',NULL,'Supplier',NULL)$$,
  '42501', 'trip_revoke_delivered_owner_only');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', false);
SELECT closure_expect('cross org submit',
  $$SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000c','status_change','x','{}','at_drop',NULL,'Other',NULL)$$,
  'P0001', 'submit_business_event: trip 30000000-0000-0000-0000-00000000000c not accessible for org 10000000-0000-0000-0000-00000000000a');
SELECT closure_expect('cross org b2b',
  $$SELECT public.process_b2b_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000c','status_change','{"new_status":"at_drop"}'::jsonb)$$,
  '42501', 'process_b2b_event: trip 30000000-0000-0000-0000-00000000000c not accessible for org 10000000-0000-0000-0000-00000000000a');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', false);
SELECT closure_expect('inactive submit',
  $$SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000d','status_change','x','{}','in_progress',NULL,'Inactive',NULL)$$,
  'P0001', 'submit_business_event: trip 30000000-0000-0000-0000-00000000000d not accessible for org 10000000-0000-0000-0000-00000000000a');

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-00000000000e';

RESET ROLE;

INSERT INTO closure_results
SELECT 'status ' || t.id::text, t.status = e.expected, t.status
FROM (VALUES
  ('30000000-0000-0000-0000-000000000001', 'at_drop'),
  ('30000000-0000-0000-0000-000000000002', 'delivered'),
  ('30000000-0000-0000-0000-000000000003', 'at_drop'),
  ('30000000-0000-0000-0000-000000000004', 'completed'),
  ('30000000-0000-0000-0000-000000000005', 'in_progress'),
  ('30000000-0000-0000-0000-000000000006', 'cancelled'),
  ('30000000-0000-0000-0000-000000000007', 'in_progress'),
  ('30000000-0000-0000-0000-000000000008', 'cancelled'),
  ('30000000-0000-0000-0000-000000000009', 'Completed'),
  ('30000000-0000-0000-0000-00000000000a', 'in_progress'),
  ('30000000-0000-0000-0000-00000000000b', 'at_drop'),
  ('30000000-0000-0000-0000-00000000000c', 'completed'),
  ('30000000-0000-0000-0000-00000000000d', 'assigned'),
  ('30000000-0000-0000-0000-00000000000e', 'at_drop'),
  ('30000000-0000-0000-0000-00000000000f', 'in_transit')
) AS e(id, expected)
JOIN public.trips t ON t.id = e.id::uuid;

INSERT INTO closure_results
SELECT 'messages ' || t.id::text,
       (SELECT count(*) FROM public.trip_messages m JOIN public.trip_conversations c ON c.id = m.conversation_id WHERE c.trip_id = t.id) = e.n,
       (SELECT count(*)::text FROM public.trip_messages m JOIN public.trip_conversations c ON c.id = m.conversation_id WHERE c.trip_id = t.id)
FROM (VALUES
  ('30000000-0000-0000-0000-000000000001', 1),
  ('30000000-0000-0000-0000-000000000002', 0),
  ('30000000-0000-0000-0000-000000000003', 1),
  ('30000000-0000-0000-0000-000000000004', 1),
  ('30000000-0000-0000-0000-000000000005', 0),
  ('30000000-0000-0000-0000-000000000006', 1),
  ('30000000-0000-0000-0000-000000000007', 0),
  ('30000000-0000-0000-0000-000000000008', 0),
  ('30000000-0000-0000-0000-000000000009', 0),
  ('30000000-0000-0000-0000-00000000000a', 1),
  ('30000000-0000-0000-0000-00000000000b', 1),
  ('30000000-0000-0000-0000-00000000000c', 0),
  ('30000000-0000-0000-0000-00000000000d', 0),
  ('30000000-0000-0000-0000-00000000000e', 0),
  ('30000000-0000-0000-0000-00000000000f', 0)
) AS e(id, n)
JOIN public.trips t ON t.id = e.id::uuid;

-- Repeated event still records a message after the status has already changed.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
SELECT public.submit_business_event('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','status_change','again','{}','in_progress',NULL,'Dispatcher',NULL);
RESET ROLE;
INSERT INTO closure_results
SELECT 'repeat event',
       (SELECT count(*) FROM public.trip_messages m JOIN public.trip_conversations c ON c.id = m.conversation_id WHERE c.trip_id = '30000000-0000-0000-0000-00000000000a') = 2,
       (SELECT count(*)::text FROM public.trip_messages m JOIN public.trip_conversations c ON c.id = m.conversation_id WHERE c.trip_id = '30000000-0000-0000-0000-00000000000a');

SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, detail FROM closure_results ORDER BY name;
