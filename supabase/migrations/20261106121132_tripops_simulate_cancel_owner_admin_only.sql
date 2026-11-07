-- Cancel trip (pre-pickup) and Simulate / Revoke Last are owner / admin only
-- in the app (`ownerAdminOnly` on tripops.trips.cancel / .simulate). Drop
-- simulate from the TripOps department-manager allowlist so managers cannot
-- grant a toggle that non-owners can never use. Do not add cancel here.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.manager_department_surfaces(p_department text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_department
    WHEN 'finance' THEN ARRAY[
      'finance.add_transaction',
      'finance.branding',
      'finance.business_pulse',
      'finance.documents_center',
      'finance.edit_transaction',
      'finance.expenses.approve',
      'finance.expenses.view',
      'finance.invoicing',
      'finance.ledger.customers',
      'finance.ledger.driver',
      'finance.ledger.suppliers',
      'finance.ledger.vehicle',
      'finance.manage',
      'finance.pod_reconciliation',
      'finance.reports',
      'finance.shared_ledger',
      'finance.subtab.cash',
      'finance.subtab.customers',
      'finance.subtab.drivers',
      'finance.subtab.garage',
      'finance.subtab.suppliers',
      'finance.tab',
      'finance.trip_ledger',
      'finance.view',
      'finance.void_adjustments',
      'fleet.drivers.view',
      'fleet.vehicles.view',
      'sales.clients.detail',
      'sales.clients.view',
      'sales.suppliers.detail',
      'sales.suppliers.view',
      'sales.tab',
      'trip_compliance.documents.view',
      'trip_compliance.finance.manage',
      'trip_compliance.finance.reject',
      'trip_compliance.finance.view',
      'trip_compliance.tab',
      'trip_compliance.tab.advance_payment',
      'trip_compliance.tab.advance_verification',
      'trip_compliance.tab.final_settlement',
      'trip_compliance.tab.settlement_verification',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.expenses',
      'tripops.trips.finance',
      'tripops.trips.view'
    ]::text[]
    WHEN 'sales' THEN ARRAY[
      'sales.chat',
      'sales.clients.analytics',
      'sales.clients.create',
      'sales.clients.detail',
      'sales.clients.edit',
      'sales.clients.view',
      'sales.load_board',
      'sales.marketplace.bid',
      'sales.marketplace.post',
      'sales.network.connect',
      'sales.network.discover',
      'sales.network.stories',
      'sales.suppliers.analytics',
      'sales.suppliers.create',
      'sales.suppliers.detail',
      'sales.suppliers.edit',
      'sales.suppliers.view',
      'sales.tab',
      'tripops.indents.allocate',
      'tripops.indents.award',
      'tripops.indents.bid',
      'tripops.indents.broadcast',
      'tripops.indents.cancel',
      'tripops.indents.create',
      'tripops.indents.edit',
      'tripops.indents.view',
      'tripops.pulse_loads',
      'tripops.tab',
      'tripops.trips.assign',
      'tripops.trips.create_aggregate',
      'tripops.trips.create_asset',
      'tripops.trips.detail',
      'tripops.trips.reassign',
      'tripops.trips.view'
    ]::text[]
    WHEN 'tripops' THEN ARRAY[
      'fleet.drivers.analytics',
      'fleet.drivers.assign_vehicle',
      'fleet.drivers.create',
      'fleet.drivers.edit',
      'fleet.drivers.invite',
      'fleet.drivers.view',
      'fleet.vehicles.analytics',
      'fleet.vehicles.create',
      'fleet.vehicles.documents',
      'fleet.vehicles.edit',
      'fleet.vehicles.view',
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'trip_compliance.trip.resubmit',
      'tripops.tab',
      'tripops.trips.assign',
      'tripops.trips.create_aggregate',
      'tripops.trips.create_asset',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.expenses',
      'tripops.trips.finance',
      'tripops.trips.ratings',
      'tripops.trips.reassign',
      'tripops.trips.tracking',
      'tripops.trips.verification',
      'tripops.trips.view'
    ]::text[]
    WHEN 'compliance' THEN ARRAY[
      'trip_compliance.documents.verify',
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'trip_compliance.trip.mark_verified',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.view'
    ]::text[]
    WHEN 'debit_control' THEN ARRAY[
      'trip_compliance.pod.manage',
      'trip_compliance.tab',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.view'
    ]::text[]
    WHEN 'vendor_support' THEN ARRAY[
      'finance.subtab.suppliers',
      'finance.tab',
      'finance.view',
      'sales.suppliers.analytics',
      'sales.suppliers.create',
      'sales.suppliers.detail',
      'sales.suppliers.edit',
      'sales.suppliers.view',
      'sales.tab'
    ]::text[]
    WHEN 'ground_ops' THEN ARRAY[
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'trip_compliance.trip.resubmit',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.view'
    ]::text[]
    WHEN 'sourcing' THEN ARRAY[
      'sales.tab',
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'tripops.indents.view',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.view'
    ]::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

REVOKE ALL ON FUNCTION public.manager_department_surfaces(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_department_surfaces(text) TO authenticated;

COMMENT ON FUNCTION public.manager_department_surfaces(text) IS
  'Department-manager surface allowlist. TripOps excludes tripops.trips.simulate and tripops.trips.cancel (owner/admin only in the app).';
