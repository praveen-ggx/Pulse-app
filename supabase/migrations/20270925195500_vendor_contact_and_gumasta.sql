-- Vendor onboarding: secondary mobile number and Gumasta (Maharashtra Shop & Establishment)
-- licence number on suppliers. Additive, nullable, idempotent.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS secondary_phone text,
  ADD COLUMN IF NOT EXISTS gumasta_number text;

COMMENT ON COLUMN public.suppliers.secondary_phone IS
  'Secondary / alternate mobile (+91XXXXXXXXXX). Primary stays in suppliers.phone.';
COMMENT ON COLUMN public.suppliers.gumasta_number IS
  'Gumasta (Shop & Establishment licence) registration number — mainly Mumbai / Maharashtra vendors.';
