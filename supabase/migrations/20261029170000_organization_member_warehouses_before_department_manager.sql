-- Prerequisite for 20261029171316 on a clean replay.
--
-- organization_member_warehouses is defined in 20270917100000. That version
-- sorts later, but on databases that already existed the ground-ops migration
-- was applied first and the department-manager migration then replaced its
-- policies. A filename-order replay reaches the policy statements while the
-- table is still absent, and DROP POLICY requires the relation.
--
-- This file installs the same table, keys, and indexes. It does not install
-- policies: 20261029171316 replaces the staff write policy with owner/admin
-- write, and 20270917100000 still installs the member self-read policy.
-- CREATE TABLE IF NOT EXISTS leaves an environment that already has the table
-- unchanged. No anonymous grant.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.organization_member_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.client_warehouses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_member_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_org_member_warehouses_member
  ON public.organization_member_warehouses(organization_member_id);

CREATE INDEX IF NOT EXISTS idx_org_member_warehouses_warehouse
  ON public.organization_member_warehouses(warehouse_id);

ALTER TABLE public.organization_member_warehouses ENABLE ROW LEVEL SECURITY;
