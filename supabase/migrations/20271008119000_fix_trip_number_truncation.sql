-- Fix: trip conversion fails with duplicate key trips_organization_id_trip_number_key
-- once an org's trip sequence passes 999 (GoGoVan prod reached 1006 on 11 Oct 2026).
-- set_trip_operational_identity() built trip_number with lpad(seq, 3) which cuts
-- '1007' to '100', so every new trip got 'TRP100'. Only that one line changes;
-- the rest is the live prod/preprod definition (they are identical).
-- No data changes. Existing trips keep their numbers.

CREATE OR REPLACE FUNCTION public.set_trip_operational_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq_text text;
  v_seq_int integer;
  v_legacy text;
BEGIN
  IF NEW.trip_code IS NULL OR btrim(NEW.trip_code) = '' THEN
    NEW.trip_code := public.generate_operational_code(NEW.organization_id, 'trip');
  END IF;

  v_seq_text := substring(NEW.trip_code FROM '([0-9]+)$');
  v_seq_int := CASE WHEN v_seq_text IS NULL THEN NULL ELSE v_seq_text::integer END;
  -- lpad() truncates text longer than the width: sequence 1007 became 'TRP100'
  -- and collided with the existing TRP100 (trips_organization_id_trip_number_key).
  -- Pad to at least 3 digits, never cut longer numbers.
  v_legacy := 'TRP' || lpad(coalesce(v_seq_int, 1)::text, greatest(3, length(coalesce(v_seq_int, 1)::text)), '0');

  IF NEW.trip_number IS NULL OR btrim(NEW.trip_number) = '' THEN
    NEW.trip_number := v_legacy;
  END IF;
  IF NEW.display_trip_id IS NULL OR btrim(NEW.display_trip_id) = '' THEN
    NEW.display_trip_id := v_legacy;
  END IF;
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := coalesce(v_seq_int, 1);
  END IF;

  IF NEW.indent_id IS NOT NULL THEN
    IF NEW.source_indent_id IS NULL THEN
      NEW.source_indent_id := NEW.indent_id;
    END IF;
    IF NEW.source_indent_code IS NULL OR btrim(NEW.source_indent_code) = '' THEN
      SELECT coalesce(i.indent_code, i.display_indent_id, i.indent_number)
      INTO NEW.source_indent_code
      FROM public.indents i
      WHERE i.id = NEW.indent_id;
    END IF;
    IF NEW.converted_from_indent_at IS NULL THEN
      NEW.converted_from_indent_at := now();
    END IF;
    IF NEW.converted_by IS NULL THEN
      NEW.converted_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
