INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444');

INSERT INTO public.organizations (id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.organization_members (organization_id, user_id, status, role, permissions) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'active', 'member',
    '{"surfaces":{"trip_compliance.finance.view":"true","trip_compliance.finance.manage":"true"}}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'active', 'member',
    '{"surfaces":{"trip_compliance.finance.view":"true"}}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'active', 'member',
    '{"surfaces":{"trip_compliance.finance.view":"true","trip_compliance.finance.manage":"true"}}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'active', 'member',
    '{"surfaces":{"trip_compliance.finance.view":"true","trip_compliance.finance.manage":"true"}}');

INSERT INTO public.trips (id, organization_id, compliance_verified_at, pod_received_at) VALUES
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), now());

INSERT INTO public.transactions (
  id, organization_id, trip_id, ledger_category, description, payment_reference, transaction_date, amount_out, amount_in
) VALUES
  ('77777777-7777-7777-7777-777777777771', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555',
    'compliance_advance', 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001', 'OLD123456', '2026-09-01', 1000, 0),
  ('77777777-7777-7777-7777-777777777772', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555',
    'compliance_advance', 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001', 'OLD123456', '2026-09-01', 1000, 0),
  ('77777777-7777-7777-7777-777777777774', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL,
    'compliance_advance', 'Advance | Mode: UPI | UTR: OLD123456', 'OLD123456', '2026-09-01', 1000, 0),
  ('77777777-7777-7777-7777-777777777773', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '66666666-6666-6666-6666-666666666666',
    'compliance_advance', 'Advance | Mode: UPI | UTR: OTHER1234', 'OTHER1234', '2026-09-01', 50, 0);

CREATE TABLE public.bulk_test_state (
  k text PRIMARY KEY,
  v text
);
CREATE TABLE public.bulk_test_log (
  id serial PRIMARY KEY,
  who text,
  result jsonb,
  error text
);
GRANT INSERT, SELECT ON public.bulk_test_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.bulk_test_log_id_seq TO authenticated;
