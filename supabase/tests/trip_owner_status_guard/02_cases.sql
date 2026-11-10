CREATE TABLE guard_results (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);
GRANT INSERT ON guard_results TO authenticated;

CREATE OR REPLACE FUNCTION guard_expect(p_name text, p_sql text, p_err text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_sqlstate text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    INSERT INTO guard_results VALUES (p_name, false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    INSERT INTO guard_results VALUES (
      p_name,
      v_sqlstate = '42501' AND v_message = p_err,
      v_sqlstate || ' ' || v_message
    );
  END;
END;
$$;

-- Identities
-- trip ops member of org A
-- owner of org A
-- platform admin (role member) of org A
-- ground ops of org A
-- owner of org B only

INSERT INTO public.organization_members (id, organization_id, user_id, role, status, permissions) VALUES
  ('00000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'member', 'active', '{"platformRole":"tripops","surfaces":{"tripops.trips.simulate":true}}'),
  ('00000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 'owner', 'active', '{}'),
  ('00000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000003', 'member', 'active', '{"platformRole":"admin"}'),
  ('00000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000004', 'member', 'active', '{"platformRole":"ground_ops"}'),
  ('00000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000005', 'owner', 'active', '{}');

INSERT INTO public.trips (id, organization_id, status, source, indent_id, supplier_id) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'completed', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'delivered', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'done', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a', 'at_drop', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', 'in_transit', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000a', 'assigned', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-00000000000a', 'in_progress', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-00000000000a', 'assigned', 'market_bid', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000a', 'completed', 'indent', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');

SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

SELECT guard_expect(
  'tripops revoke completed',
  $$UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  'trip_revoke_delivered_owner_only'
);
SELECT guard_expect(
  'tripops revoke delivered',
  $$UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000002'$$,
  'trip_revoke_delivered_owner_only'
);
SELECT guard_expect(
  'tripops revoke done',
  $$UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000003'$$,
  'trip_revoke_delivered_owner_only'
);
SELECT guard_expect(
  'tripops integrated cancel',
  $$UPDATE public.trips SET status = 'cancelled', indent_id = NULL WHERE id = '30000000-0000-0000-0000-000000000006'$$,
  'trip_cancel_owner_only'
);
SELECT guard_expect(
  'tripops cancel after pickup',
  $$UPDATE public.trips SET status = 'cancelled' WHERE id = '30000000-0000-0000-0000-000000000007'$$,
  'trip_cancel_not_eligible'
);

UPDATE public.trips SET status = 'completed' WHERE id = '30000000-0000-0000-0000-000000000004';
UPDATE public.trips SET status = 'in_progress' WHERE id = '30000000-0000-0000-0000-000000000005';
UPDATE public.trips SET status = 'cancelled' WHERE id = '30000000-0000-0000-0000-000000000008';

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000009';
UPDATE public.trips SET status = 'cancelled', indent_id = NULL WHERE id = '30000000-0000-0000-0000-000000000006';

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000003';
UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000001';

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000004';
SELECT guard_expect(
  'ground ops revoke completed',
  $$UPDATE public.trips SET status = 'in_transit' WHERE id = '30000000-0000-0000-0000-000000000002'$$,
  'trip_revoke_delivered_owner_only'
);

RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000005';
SELECT guard_expect(
  'cross org revoke completed',
  $$UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000003'$$,
  'trip_revoke_delivered_owner_only'
);

RESET ROLE;
SET ROLE service_role;
UPDATE public.trips SET status = 'at_drop' WHERE id = '30000000-0000-0000-0000-000000000003';

RESET ROLE;

INSERT INTO guard_results VALUES (
  'denied rows unchanged',
  (SELECT status = 'in_progress' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000007'),
  (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000007')
);

INSERT INTO guard_results VALUES
  ('tripops simulate complete', (SELECT status = 'completed' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000004'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000004')),
  ('tripops revoke before delivery', (SELECT status = 'in_progress' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000005'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000005')),
  ('marketplace cancel stays open', (SELECT status = 'cancelled' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000008'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000008')),
  ('owner revoke after delivery', (SELECT status = 'at_drop' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000009'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000009')),
  ('owner integrated cancel', (SELECT status = 'cancelled' AND indent_id IS NULL FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000006'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000006')),
  ('platform admin revoke', (SELECT status = 'at_drop' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000001'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000001')),
  ('service role revoke', (SELECT status = 'at_drop' FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000003'), (SELECT status FROM public.trips WHERE id = '30000000-0000-0000-0000-000000000003'));

SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, detail FROM guard_results ORDER BY name;
