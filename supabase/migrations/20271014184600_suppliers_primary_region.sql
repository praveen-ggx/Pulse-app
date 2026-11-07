-- Single primary operating region for a supplier profile.
-- Null means the partner has not chosen a region yet.
--
-- Same column as team-sync 20271006161000. Replayed here so V1.0.1 can ship
-- the column without depending on the unapplied PR #1 history.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS primary_region text;

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_primary_region_check;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_primary_region_check
  CHECK (primary_region IS NULL OR primary_region IN ('North', 'South', 'East', 'West'));

COMMENT ON COLUMN public.suppliers.primary_region IS
  'Primary region for the partner: North, South, East, or West.';
