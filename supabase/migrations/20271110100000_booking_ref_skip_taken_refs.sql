-- booking_ref_seq can fall behind refs already present on trips (preprod:
-- seq at 1969 while refs up to 2109 existed). Every indent/market trip insert
-- then hit trips_booking_ref_key, which surfaced in the driver app as
-- "We could not confirm your job after payment" after a paid DCO award.
--
-- Fix: skip any encoded ref that is already taken, and resync the sequence
-- once so normal inserts don't have to walk the gap.

CREATE OR REPLACE FUNCTION public.trg_set_booking_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq      bigint;
  v_ref      text;
  v_attempts int := 0;
BEGIN
  IF NEW.booking_ref IS NOT NULL AND btrim(NEW.booking_ref) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source_indent_id IS NULL AND NEW.indent_id IS NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    v_seq := nextval('public.booking_ref_seq');
    v_ref := public.sqids_encode_booking_ref(v_seq);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.booking_ref = v_ref);
    v_attempts := v_attempts + 1;
    IF v_attempts >= 10000 THEN
      RAISE EXCEPTION 'booking_ref_exhausted: no free booking_ref after % attempts', v_attempts;
    END IF;
  END LOOP;

  NEW.booking_ref := v_ref;
  RETURN NEW;
END;
$function$;

-- One-time resync: advance the sequence past the highest value whose encoded
-- ref is already in use (scans a bounded window above the current value).
DO $$
DECLARE
  v_cur  bigint;
  v_max  bigint;
BEGIN
  SELECT last_value INTO v_cur FROM public.booking_ref_seq;

  SELECT max(n) INTO v_max
  FROM generate_series(1, v_cur + 10000) AS n
  WHERE EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.booking_ref = public.sqids_encode_booking_ref(n)
  );

  IF v_max IS NOT NULL AND v_max > v_cur THEN
    PERFORM setval('public.booking_ref_seq', v_max, true);
  END IF;
END;
$$;
