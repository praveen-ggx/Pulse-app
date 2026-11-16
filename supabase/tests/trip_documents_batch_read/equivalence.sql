-- list_trip_documents_for_trips vs trip_documents RLS, for real users.
-- Run inside a transaction that is rolled back. Prints counts only, no ids.
-- Needs 20271116100000 applied (or executed earlier in the same transaction).

-- 1. The policies this function mirrors must be unchanged.
CREATE TEMP TABLE td_policy_check ON COMMIT DROP AS
SELECT tablename, policyname, permissive, cmd, md5(coalesce(qual, '')) AS qual_md5
FROM pg_policies
WHERE schemaname = 'public'
  AND ((tablename = 'trip_documents' AND cmd IN ('SELECT', 'ALL'))
    OR (tablename IN ('trip_fuel_entries', 'trip_toll_entries', 'trip_other_expenses') AND cmd IN ('SELECT', 'ALL')));

CREATE TEMP TABLE td_eq (
  who text, set_name text, rls_ids uuid[], rpc_ids uuid[], paged_ids uuid[],
  rls_ms numeric, rpc_ms numeric
) ON COMMIT DROP;
GRANT ALL ON td_eq TO authenticated;

DO $$
DECLARE
  v_org uuid;
  v_sets jsonb := '{}'::jsonb;
  v_users jsonb := '[]'::jsonb;
  rec_u record;
  rec_s record;
  v_rls uuid[];
  v_rpc uuid[];
  v_paged uuid[];
  v_page uuid[];
  v_after uuid;
  t0 timestamptz;
  t1 timestamptz;
  t2 timestamptz;
BEGIN
  SELECT t.organization_id INTO v_org
  FROM public.trip_documents d JOIN public.trips t ON t.id = d.trip_id
  GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  v_sets := jsonb_build_object(
    'busiest_org_100', (SELECT jsonb_agg(id) FROM (SELECT t.id FROM public.trips t WHERE t.organization_id = v_org ORDER BY t.created_at DESC LIMIT 100) x),
    'cross_org_100', (SELECT jsonb_agg(id) FROM (SELECT t.id FROM public.trips t WHERE t.organization_id <> v_org AND EXISTS (SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id) ORDER BY t.created_at DESC LIMIT 100) x),
    'receipt_trips', (SELECT coalesce(jsonb_agg(DISTINCT d.trip_id), '[]'::jsonb) FROM public.trip_documents d WHERE d.document_type IN ('fuel_bill_photo', 'toll_receipt_photo', 'trip_expense_receipt_photo')),
    'with_missing_ids', (SELECT jsonb_agg(id) FROM (SELECT t.id FROM public.trips t WHERE t.organization_id = v_org ORDER BY t.created_at DESC LIMIT 20) x) || jsonb_build_array(gen_random_uuid(), gen_random_uuid()),
    'empty', '[]'::jsonb
  );

  -- Users: every role of the busiest orgs, inactive members, drivers, supplier/client
  -- linked org members, receipt uploaders/owners, and unrelated users.
  SELECT jsonb_agg(DISTINCT jsonb_build_object('uid', x.uid, 'kind', x.kind)) INTO v_users FROM (
    (SELECT m.user_id uid, 'member:' || m.role || ':' || m.status kind
     FROM public.organization_members m
     WHERE m.organization_id IN (SELECT t.organization_id FROM public.trip_documents d JOIN public.trips t ON t.id = d.trip_id GROUP BY 1 ORDER BY count(*) DESC LIMIT 3)
     ORDER BY m.role, m.status, m.user_id LIMIT 60)
    UNION ALL
    (SELECT m.user_id, 'inactive' FROM public.organization_members m WHERE m.status <> 'active' ORDER BY m.user_id LIMIT 5)
    UNION ALL
    (SELECT dr.user_id, 'driver' FROM public.drivers dr JOIN public.trips t ON t.driver_id = dr.id
     WHERE dr.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id) GROUP BY dr.user_id ORDER BY dr.user_id LIMIT 10)
    UNION ALL
    (SELECT m.user_id, 'supplier_linked' FROM public.trips t JOIN public.suppliers s ON s.id = t.supplier_id
     JOIN public.organization_members m ON m.organization_id = s.linked_organization_id AND m.status = 'active'
     WHERE t.organization_id = v_org GROUP BY m.user_id ORDER BY m.user_id LIMIT 10)
    UNION ALL
    (SELECT m.user_id, 'client_linked' FROM public.trips t JOIN public.clients c ON c.id = t.client_id
     JOIN public.organization_members m ON m.organization_id = c.organization_id AND m.status = 'active'
     WHERE c.organization_id IS NOT NULL AND c.organization_id <> t.organization_id GROUP BY m.user_id ORDER BY m.user_id LIMIT 10)
    UNION ALL
    (SELECT d.uploaded_by, 'receipt_uploader' FROM public.trip_documents d
     WHERE d.document_type IN ('fuel_bill_photo', 'toll_receipt_photo', 'trip_expense_receipt_photo') AND d.uploaded_by IS NOT NULL GROUP BY 1 LIMIT 5)
    UNION ALL
    (SELECT m.user_id, 'other_org' FROM public.organization_members m
     WHERE m.status = 'active' AND m.organization_id <> v_org ORDER BY md5(m.user_id::text) LIMIT 10)
  ) x WHERE x.uid IS NOT NULL;

  FOR rec_u IN SELECT (e->>'uid')::uuid AS uid, e->>'kind' AS kind FROM jsonb_array_elements(v_users) e LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', rec_u.uid, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    FOR rec_s IN SELECT key AS name, value AS ids FROM jsonb_each(v_sets) LOOP
      t0 := clock_timestamp();
      SELECT coalesce(array_agg(d.id ORDER BY d.id), '{}') INTO v_rls
      FROM public.trip_documents d
      WHERE d.trip_id = ANY (ARRAY(SELECT jsonb_array_elements_text(rec_s.ids)::uuid));
      t1 := clock_timestamp();
      SELECT coalesce(array_agg(r.id ORDER BY r.id), '{}') INTO v_rpc
      FROM public.list_trip_documents_for_trips(ARRAY(SELECT jsonb_array_elements_text(rec_s.ids)::uuid), NULL, 1000) r;
      t2 := clock_timestamp();
      -- Keyset walk with a tiny page must return the same rows.
      v_paged := '{}'; v_after := NULL;
      LOOP
        SELECT coalesce(array_agg(r.id ORDER BY r.id), '{}') INTO v_page
        FROM public.list_trip_documents_for_trips(ARRAY(SELECT jsonb_array_elements_text(rec_s.ids)::uuid), v_after, 37) r;
        EXIT WHEN cardinality(v_page) = 0;
        v_paged := v_paged || v_page;
        v_after := v_page[cardinality(v_page)];
      END LOOP;
      INSERT INTO td_eq VALUES (rec_u.kind, rec_s.name, v_rls, v_rpc, v_paged,
        extract(epoch FROM t1 - t0) * 1000, extract(epoch FROM t2 - t1) * 1000);
    END LOOP;
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;

SELECT 'policies' AS check_name, count(*)::text AS n, string_agg(tablename || '.' || policyname || '=' || qual_md5, ' ' ORDER BY tablename, policyname) AS detail
FROM td_policy_check
UNION ALL
SELECT 'cases', count(*)::text, NULL FROM td_eq
UNION ALL
SELECT 'users', count(DISTINCT who)::text, string_agg(DISTINCT split_part(who, ':', 1), ',') FROM td_eq
UNION ALL
SELECT 'mismatch_rls_vs_rpc', count(*) FILTER (WHERE rls_ids IS DISTINCT FROM rpc_ids)::text, NULL FROM td_eq
UNION ALL
SELECT 'mismatch_rls_vs_paged', count(*) FILTER (WHERE rls_ids IS DISTINCT FROM paged_ids)::text, NULL FROM td_eq
UNION ALL
SELECT 'cases_with_rows', count(*) FILTER (WHERE cardinality(rls_ids) > 0)::text, sum(cardinality(rls_ids))::text FROM td_eq
UNION ALL
SELECT 'cases_hidden_by_rls', count(*) FILTER (WHERE cardinality(rls_ids) = 0 AND set_name NOT IN ('empty'))::text, NULL FROM td_eq
UNION ALL
SELECT 'receipt_rows_visible', coalesce(sum(cardinality(rls_ids)) FILTER (WHERE set_name = 'receipt_trips'), 0)::text, NULL FROM td_eq
UNION ALL
SELECT 'busiest_org_100_ms_rls_avg', round(avg(rls_ms) FILTER (WHERE set_name = 'busiest_org_100' AND cardinality(rls_ids) > 0), 1)::text,
       'rpc_avg=' || round(avg(rpc_ms) FILTER (WHERE set_name = 'busiest_org_100' AND cardinality(rls_ids) > 0), 1)
FROM td_eq
UNION ALL
SELECT 'grants', (has_function_privilege('anon', 'public.list_trip_documents_for_trips(uuid[], uuid, integer)', 'EXECUTE'))::text,
       'authenticated=' || has_function_privilege('authenticated', 'public.list_trip_documents_for_trips(uuid[], uuid, integer)', 'EXECUTE');
