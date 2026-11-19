-- Driver trip pay: commission % and per-km rate ADD UP.
--
-- Before: fill_driver_commission picked ONE term — commission % if set, else
-- per km. A driver offered "3% + ₹10/km" was paid only the 3%.
-- Now:    driver_commission = (client_price × commission_percent / 100)
--                            + (distance × commission_per_km)
-- Example: ₹1,000 trip, 72 km, 3% + ₹10/km → 30 + 720 = ₹750.
--
-- Unchanged on purpose (20270131130000):
--   * only fills when driver_commission is 0 (a figure set by hand survives)
--   * only for the driver's OWN org trip (no broker-row phantom pay)
--   * search_path pinned to public (20271005211835 §7)
-- Existing trips are not touched: this only runs for trips completing later.
-- Mirrors tripEarningsDetailForDriver in features/drivers/utils/driverUtils.util.ts.

CREATE OR REPLACE FUNCTION public.fill_driver_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_commission_percent NUMERIC;
  v_commission_per_km  NUMERIC;
  v_driver_org         uuid;
  v_percent_part       NUMERIC := 0;
  v_per_km_part        NUMERIC := 0;
BEGIN
  IF NEW.driver_id IS NULL OR COALESCE(NEW.driver_commission, 0) != 0 THEN
    RETURN NEW;
  END IF;

  SELECT commission_percent, commission_per_km, organization_id
  INTO v_commission_percent, v_commission_per_km, v_driver_org
  FROM drivers
  WHERE id = NEW.driver_id
  LIMIT 1;

  IF v_driver_org IS DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_commission_percent, 0) > 0 AND COALESCE(NEW.client_price, 0) > 0 THEN
    v_percent_part := ROUND(NEW.client_price * LEAST(v_commission_percent, 100) / 100, 2);
  END IF;

  IF COALESCE(v_commission_per_km, 0) > 0 AND COALESCE(NEW.distance, 0) > 0 THEN
    v_per_km_part := ROUND(CAST(NEW.distance AS NUMERIC) * v_commission_per_km, 2);
  END IF;

  IF v_percent_part + v_per_km_part > 0 THEN
    NEW.driver_commission := v_percent_part + v_per_km_part;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
