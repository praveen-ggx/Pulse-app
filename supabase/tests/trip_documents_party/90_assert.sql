-- Assertions for the two authorization migrations. Failures raise.
-- Runs in the same transaction as 00_prepare.sql and the migrations.

CREATE POLICY trip_documents_select_fast
  ON public.trip_documents
  FOR SELECT
  TO authenticated
  USING (public.can_read_trip_document(trip_id));

CREATE OR REPLACE FUNCTION public.verify_trip_document(
  p_document_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trip_id uuid;
  v_org_id uuid;
BEGIN
  IF p_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;
  IF p_status = 'rejected' AND coalesce(trim(p_rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'rejection_reason is required when rejecting a document';
  END IF;
  SELECT td.trip_id, t.organization_id
    INTO v_trip_id, v_org_id
    FROM public.trip_documents td
    JOIN public.trips t ON t.id = td.trip_id
   WHERE td.id = p_document_id;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'document not found';
  END IF;
  IF NOT public.has_member_surface(v_org_id, 'trip_compliance.documents.verify') THEN
    RAISE EXCEPTION 'not authorized to verify compliance documents for this organization';
  END IF;
  UPDATE public.trip_documents
     SET status = p_status,
         verified_by = v_uid,
         verified_at = now(),
         rejection_reason = CASE WHEN p_status = 'rejected' THEN trim(p_rejection_reason) ELSE NULL END
   WHERE id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_trip_document(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_trip_document(uuid, text, text) TO authenticated;

INSERT INTO auth.users (id) VALUES
  ('a1111111-1111-4111-8111-111111111111'),
  ('a2222222-2222-4222-8222-222222222222'),
  ('a3333333-3333-4333-8333-333333333333'),
  ('a4444444-4444-4444-8444-444444444444'),
  ('a5555555-5555-4555-8555-555555555555'),
  ('a6666666-6666-4666-8666-666666666666'),
  ('a7777777-7777-4777-8777-777777777777'),
  ('a8888888-8888-4888-8888-888888888888'),
  ('a9999999-9999-4999-8999-999999999999');

INSERT INTO public.organizations (id, name, settings, operational_code) VALUES
  ('11111111-1111-4111-8111-111111111111', 'trip-org', '{"groundOpsDocUploadEnabled": false}'::jsonb, 'TRPORG'),
  ('22222222-2222-4222-8222-222222222222', 'client-org', '{}'::jsonb, 'CLIORG'),
  ('33333333-3333-4333-8333-333333333333', 'supplier-org', '{}'::jsonb, 'SUPORG'),
  ('44444444-4444-4444-8444-444444444444', 'other-org', '{}'::jsonb, 'OTHORG'),
  ('55555555-5555-4555-8555-555555555555', 'stale-org', '{}'::jsonb, 'STLORG');

INSERT INTO public.organization_members (organization_id, user_id, role, status, permissions) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'member', 'active', '{}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'member', 'active', '{"platformRole":"ground_ops"}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'a9999999-9999-4999-8999-999999999999', 'member', 'active', '{"platformRole":"ground_ops"}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333', 'member', 'active', '{"surfaces":{"trip_compliance.documents.verify":true}}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'a4444444-4444-4444-8444-444444444444', 'member', 'active', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 'member', 'active', '{}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'a5555555-5555-4555-8555-555555555555', 'member', 'active', '{}'::jsonb),
  ('44444444-4444-4444-8444-444444444444', 'a7777777-7777-4777-8777-777777777777', 'owner', 'active', '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'a8888888-8888-4888-8888-888888888888', 'member', 'active', '{}'::jsonb);

INSERT INTO public.clients (organization_id, name, phone, linked_organization_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'linked client', '9000000001', '22222222-2222-4222-8222-222222222222'),
  ('11111111-1111-4111-8111-111111111111', 'null client', '9000000002', NULL),
  ('11111111-1111-4111-8111-111111111111', 'stale client', '9000000003', '55555555-5555-4555-8555-555555555555');

INSERT INTO public.suppliers (organization_id, linked_organization_id) VALUES
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');

INSERT INTO public.drivers (organization_id, name, user_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'assigned driver', 'a6666666-6666-4666-8666-666666666666');

INSERT INTO public.indents (organization_id, indent_number, pickup_area, drop_location, client_name, warehouse_id)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'IND-VAULT-1',
  'A',
  'B',
  'linked client',
  'f3333333-3333-4333-8333-333333333333'
);

INSERT INTO public.trips (
  organization_id, trip_number, pickup_area, drop_location, client_name,
  client_id, supplier_id, driver_id, indent_id
)
SELECT
  '11111111-1111-4111-8111-111111111111',
  'TRP-VAULT-1',
  'A',
  'B',
  'linked client',
  (SELECT id FROM public.clients WHERE name = 'linked client'),
  (SELECT id FROM public.suppliers WHERE linked_organization_id = '33333333-3333-4333-8333-333333333333' LIMIT 1),
  (SELECT id FROM public.drivers WHERE user_id = 'a6666666-6666-4666-8666-666666666666'),
  (SELECT id FROM public.indents WHERE indent_number = 'IND-VAULT-1');

INSERT INTO public.trips (
  id, organization_id, trip_number, pickup_area, drop_location, client_name, client_id
) VALUES (
  'b2222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'TRP-VAULT-NULL',
  'A', 'B', 'null client',
  (SELECT id FROM public.clients WHERE name = 'null client')
), (
  'b3333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'TRP-VAULT-STALE',
  'A', 'B', 'stale client',
  (SELECT id FROM public.clients WHERE name = 'stale client')
);

UPDATE public.trips
   SET supplier_id = (
     SELECT id FROM public.suppliers
     WHERE linked_organization_id = '33333333-3333-4333-8333-333333333333'
     LIMIT 1
   ),
   driver_id = (
     SELECT id FROM public.drivers
     WHERE user_id = 'a6666666-6666-4666-8666-666666666666'
   ),
   client_id = (
     SELECT id FROM public.clients WHERE name = 'linked client'
   )
 WHERE trip_number = 'TRP-VAULT-1';

-- Trip creation already opens the client conversation. Storage tests use that id.

INSERT INTO public.trip_documents (
  id, trip_id, file_name, storage_path, document_type, status, document_number,
  verified_by, verified_at, rejection_reason
)
SELECT
  'f1111111-1111-4111-8111-111111111111',
  id,
  'pod.jpg',
  id::text || '/pod/file.jpg',
  'pod',
  'verified',
  'POD-1',
  'a3333333-3333-4333-8333-333333333333',
  now(),
  NULL
FROM public.trips WHERE trip_number = 'TRP-VAULT-1';

INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id)
SELECT id, 'f3333333-3333-4333-8333-333333333333'
FROM public.organization_members
WHERE user_id = 'a9999999-9999-4999-8999-999999999999'
  AND organization_id = '11111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND p.polname IN (
        'Allow authenticated reads to trip-documents',
        'Allow authenticated uploads to trip-documents',
        'Suppliers can list storage folders'
      )
  ) THEN
    RAISE EXCEPTION 'bucket-wide trip-documents policies are still present';
  END IF;
  IF (
    SELECT count(*) FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND p.polname LIKE 'trip-documents: party %'
  ) <> 4 THEN
    RAISE EXCEPTION 'expected four party storage policies';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.become(p_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;

CREATE TEMP TABLE vault_ids AS
SELECT
  (SELECT id FROM public.trips WHERE trip_number = 'TRP-VAULT-1') AS trip_id,
  'b2222222-2222-4222-8222-222222222222'::uuid AS null_trip_id,
  'b3333333-3333-4333-8333-333333333333'::uuid AS stale_trip_id;
GRANT SELECT ON vault_ids TO authenticated;

-- Linked client can read and write. Null and stale links cannot.
SELECT pg_temp.become('a4444444-4444-4444-8444-444444444444');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_trip uuid;
  v_null uuid;
  v_stale uuid;
BEGIN
  SELECT trip_id, null_trip_id, stale_trip_id INTO v_trip, v_null, v_stale FROM vault_ids;
  IF NOT public.can_read_trip_document(v_trip) OR NOT public.can_write_trip_document_as_counterparty(v_trip) THEN
    RAISE EXCEPTION 'linked client was denied';
  END IF;
  IF public.can_read_trip_document(v_null) OR public.can_write_trip_document_as_counterparty(v_null) THEN
    RAISE EXCEPTION 'null client link granted access';
  END IF;
  IF public.can_read_trip_document(v_stale) OR public.can_write_trip_document_as_counterparty(v_stale) THEN
    RAISE EXCEPTION 'stale client link granted access';
  END IF;
  IF (SELECT count(*) FROM public.trip_documents WHERE id = 'f1111111-1111-4111-8111-111111111111') <> 1 THEN
    RAISE EXCEPTION 'linked client could not read the document row';
  END IF;
END $$;

-- Supplier can write. Unrelated org and the stale-org member cannot read.
RESET ROLE;
SELECT pg_temp.become('a5555555-5555-4555-8555-555555555555');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT trip_id INTO v_trip FROM vault_ids;
  IF NOT public.can_write_trip_document_as_counterparty(v_trip) THEN
    RAISE EXCEPTION 'linked supplier was denied write trip=% supplier=% link=%',
      v_trip,
      (SELECT supplier_id FROM public.trips WHERE id = v_trip),
      (SELECT s.linked_organization_id FROM public.suppliers s JOIN public.trips t ON t.supplier_id = s.id WHERE t.id = v_trip);
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.become('a7777777-7777-4777-8777-777777777777');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT trip_id INTO v_trip FROM vault_ids;
  IF public.can_read_trip_document(v_trip) OR public.can_write_trip_document_as_counterparty(v_trip) THEN
    RAISE EXCEPTION 'unrelated organization was granted access';
  END IF;
  IF (SELECT count(*) FROM public.trip_documents) <> 0 THEN
    RAISE EXCEPTION 'unrelated organization could read document rows';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.become('a8888888-8888-4888-8888-888888888888');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_trip uuid;
  v_stale uuid;
BEGIN
  SELECT trip_id, stale_trip_id INTO v_trip, v_stale FROM vault_ids;
  IF NOT public.can_read_trip_document(v_stale) THEN
    RAISE EXCEPTION 'member of the currently linked organization was denied';
  END IF;
  IF public.can_read_trip_document(v_trip) THEN
    RAISE EXCEPTION 'member of a different linked organization could read the trip';
  END IF;
END $$;

-- Driver can read, cannot take the counterparty write path, and cannot update.
RESET ROLE;
SELECT pg_temp.become('a6666666-6666-4666-8666-666666666666');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_trip uuid;
  v_count int;
BEGIN
  SELECT trip_id INTO v_trip FROM vault_ids;
  IF NOT public.can_read_trip_document(v_trip) THEN
    RAISE EXCEPTION 'assigned driver was denied read';
  END IF;
  IF public.can_write_trip_document_as_counterparty(v_trip) THEN
    RAISE EXCEPTION 'assigned driver received counterparty write';
  END IF;
  UPDATE public.trip_documents
     SET document_number = 'DRIVER'
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'assigned driver updated a document';
  END IF;
END $$;

-- Manager cannot demote to pending while verification metadata remains.
RESET ROLE;
SELECT pg_temp.become('a1111111-1111-4111-8111-111111111111');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE public.trip_documents
     SET status = 'pending'
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'manager demotion without clearing verification succeeded';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

DO $$
DECLARE v_count int;
BEGIN
  UPDATE public.trip_documents
     SET status = 'pending',
         verified_by = NULL,
         verified_at = NULL,
         rejection_reason = NULL
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'manager demotion that cleared verification was denied';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.trip_documents
     SET status = 'verified',
         verified_by = 'a3333333-3333-4333-8333-333333333333',
         verified_at = now()
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'manager set verified without the verifier surface';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

-- The document_number write above is inside the same statement as the illegal status change, so it rolled back with the statement.
DO $$
DECLARE v_count int;
BEGIN
  UPDATE public.trip_documents
     SET document_number = 'POD-2'
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'manager could not edit document_number';
  END IF;
END $$;

-- Verifier can verify and reject, and still cannot leave metadata behind on demotion.
RESET ROLE;
SELECT pg_temp.become('a3333333-3333-4333-8333-333333333333');
SET LOCAL ROLE authenticated;
SELECT public.verify_trip_document('f1111111-1111-4111-8111-111111111111', 'verified');
DO $$
BEGIN
  IF (SELECT status FROM public.trip_documents WHERE id = 'f1111111-1111-4111-8111-111111111111') <> 'verified' THEN
    RAISE EXCEPTION 'verify_trip_document did not verify';
  END IF;
  UPDATE public.trip_documents
     SET status = 'pending'
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'verifier demotion without clearing verification succeeded';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

SELECT public.verify_trip_document('f1111111-1111-4111-8111-111111111111', 'rejected', 'blurry');
DO $$
BEGIN
  IF (SELECT rejection_reason FROM public.trip_documents WHERE id = 'f1111111-1111-4111-8111-111111111111') <> 'blurry' THEN
    RAISE EXCEPTION 'verify_trip_document did not reject';
  END IF;
END $$;

-- Ground ops cannot update as trip-org staff. The same user, as the linked client, can replace the file.
RESET ROLE;
SELECT pg_temp.become('a2222222-2222-4222-8222-222222222222');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count int;
BEGIN
  UPDATE public.trip_documents
     SET document_number = 'GROUND'
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- document_number stays editable for a counterparty, including a ground-ops
  -- user who is also the linked client. Verification columns stay untouched.
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'linked-client ground ops could not edit document_number';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.trip_documents
     SET status = 'pending'
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'ground ops demotion without clearing verification succeeded';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

DO $$
DECLARE v_count int;
BEGIN
  UPDATE public.trip_documents
     SET storage_path = (SELECT trip_id::text || '/pod/replaced.jpg' FROM public.trip_documents WHERE id = 'f1111111-1111-4111-8111-111111111111'),
         file_name = 'replaced.jpg',
         status = 'pending',
         verified_by = NULL,
         verified_at = NULL,
         rejection_reason = NULL
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'linked-client ground ops could not replace the file';
  END IF;
END $$;

DO $$
BEGIN
  UPDATE public.trip_documents
     SET status = 'verified',
         verified_by = 'a2222222-2222-4222-8222-222222222222',
         verified_at = now()
   WHERE id = 'f1111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'ground ops verified a document';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

-- Storage objects.
RESET ROLE;
INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT 'trip-documents', id::text || '/pod/file.jpg', 'a1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111'
FROM public.trips WHERE trip_number = 'TRP-VAULT-1';

INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT
  'trip-documents',
  'trip_chat/' || tc.id::text || '/chat.jpg',
  'a4444444-4444-4444-8444-444444444444',
  'a4444444-4444-4444-8444-444444444444'
FROM public.trip_conversations tc
JOIN public.trips t ON t.id = tc.trip_id
WHERE t.trip_number = 'TRP-VAULT-1'
  AND tc.party_type = 'client';

SELECT pg_temp.become('a7777777-7777-4777-8777-777777777777');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-documents') <> 0 THEN
    RAISE EXCEPTION 'unrelated user read trip-documents objects';
  END IF;
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  VALUES ('trip-documents', 'not-a-trip/file.jpg', 'a7777777-7777-4777-8777-777777777777', 'a7777777-7777-4777-8777-777777777777');
  RAISE EXCEPTION 'unrelated user uploaded an object';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

RESET ROLE;
SELECT pg_temp.become('a1111111-1111-4111-8111-111111111111');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count int;
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-documents' AND name LIKE '%/pod/file.jpg') <> 1 THEN
    RAISE EXCEPTION 'trip-org member could not read the trip object';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE name LIKE 'trip_chat/%') <> 1 THEN
    RAISE EXCEPTION 'trip-org member could not read the chat object';
  END IF;
  UPDATE storage.objects SET metadata = '{}'::jsonb WHERE name LIKE '%/pod/file.jpg';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'object owner could not update the trip object';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.become('a4444444-4444-4444-8444-444444444444');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count int;
BEGIN
  UPDATE storage.objects SET metadata = '{}'::jsonb WHERE name LIKE '%/pod/file.jpg';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'linked client updated an object they do not own';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE name LIKE 'trip_chat/%') <> 1 THEN
    RAISE EXCEPTION 'linked client could not read the chat object';
  END IF;
END $$;

-- Ground ops insert is off until the toggle and warehouse match.
RESET ROLE;
SELECT pg_temp.become('a9999999-9999-4999-8999-999999999999');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT trip_id INTO v_trip FROM vault_ids;
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  VALUES ('trip-documents', v_trip::text || '/pod/ground-off.jpg', 'a9999999-9999-4999-8999-999999999999', 'a9999999-9999-4999-8999-999999999999');
  RAISE EXCEPTION 'ground ops uploaded while the toggle was off';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;

RESET ROLE;
UPDATE public.organizations
   SET settings = '{"groundOpsDocUploadEnabled": true}'::jsonb
 WHERE id = '11111111-1111-4111-8111-111111111111';
DELETE FROM public.organization_member_warehouses
 WHERE organization_member_id IN (
   SELECT id FROM public.organization_members
   WHERE user_id = 'a9999999-9999-4999-8999-999999999999'
 );
SELECT pg_temp.become('a9999999-9999-4999-8999-999999999999');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT trip_id INTO v_trip FROM vault_ids;
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  VALUES ('trip-documents', v_trip::text || '/pod/ground-nowarehouse.jpg', 'a9999999-9999-4999-8999-999999999999', 'a9999999-9999-4999-8999-999999999999');
  RAISE EXCEPTION 'ground ops uploaded without a warehouse match';
EXCEPTION WHEN SQLSTATE '42501' THEN
  NULL;
END $$;
RESET ROLE;
INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id)
SELECT id, 'f3333333-3333-4333-8333-333333333333'
FROM public.organization_members
WHERE user_id = 'a9999999-9999-4999-8999-999999999999'
  AND organization_id = '11111111-1111-4111-8111-111111111111';
SELECT pg_temp.become('a9999999-9999-4999-8999-999999999999');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_trip uuid;
BEGIN
  SELECT trip_id INTO v_trip FROM vault_ids;
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  VALUES ('trip-documents', v_trip::text || '/pod/ground.jpg', 'a9999999-9999-4999-8999-999999999999', 'a9999999-9999-4999-8999-999999999999');
END $$;

-- storage.protect_delete blocks direct SQL deletes. The party policy is the
-- authorization the Storage API evaluates, so these assertions call it.
DO $$
DECLARE v_allowed boolean;
BEGIN
  SELECT public.fn_trip_documents_storage_allowed(name, 'delete', NULLIF(btrim(owner_id::text), '')::uuid)
    INTO v_allowed
    FROM storage.objects
   WHERE name LIKE '%/pod/file.jpg';
  IF v_allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ground ops delete predicate was %', v_allowed;
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.become('a6666666-6666-4666-8666-666666666666');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_allowed boolean;
BEGIN
  SELECT public.fn_trip_documents_storage_allowed(name, 'delete', NULLIF(btrim(owner_id::text), '')::uuid)
    INTO v_allowed
    FROM storage.objects
   WHERE name LIKE '%/pod/file.jpg';
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'assigned driver delete predicate was %', v_allowed;
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE name LIKE 'trip_chat/%') <> 1 THEN
    RAISE EXCEPTION 'assigned driver could not read the chat object';
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.fn_trip_documents_storage_allowed('x', 'select', NULL);
  RAISE EXCEPTION 'anon could execute the storage predicate';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

RESET ROLE;
DO $$
BEGIN
  RAISE NOTICE 'AUTHORIZATION_ASSERTIONS_PASSED';
END $$;
