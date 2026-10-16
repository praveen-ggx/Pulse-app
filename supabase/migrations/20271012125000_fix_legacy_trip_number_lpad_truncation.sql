-- Applied on production (2026-10-12) outside the repository; copied verbatim from
-- production's supabase_migrations.schema_migrations.statements (2026-10-16) so the
-- repository matches production. Production already records this version.

-- Deploy load failed with trips_organization_id_trip_number_key once an org
-- passed trip 999. set_trip_operational_identity still built the legacy
-- trip_number with lpad(seq, 3, '0'). lpad truncates on the right, so
-- sequence 1001 became TRP100, which already existed.
--
-- Indent numbers were moved off that truncation in
-- 20270924165220 (format_org_local_seq_label). Trip numbers were not, so
-- the same collision came back on deploy. Manual create was unaffected
-- because the client sends a full trip_number and the trigger leaves it.

CREATE OR REPLACE FUNCTION public.set_trip_operational_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seq_text text;
  v_seq bigint;
  v_max_existing bigint;
  v_candidate text;
  v_tries int := 0;
  v_taken boolean;
BEGIN
  IF NEW.trip_code IS NULL OR btrim(NEW.trip_code) = '' THEN
    NEW.trip_code := public.generate_operational_code(NEW.organization_id, 'trip');
  END IF;

  SELECT COALESCE(MAX(
    CASE
      WHEN t.trip_number ~ '^TRP[0-9]+$'
      THEN substring(t.trip_number FROM '[0-9]+$')::bigint
      ELSE 0
    END
  ), 0)
  INTO v_max_existing
  FROM public.trips t
  WHERE t.organization_id = NEW.organization_id;

  v_seq_text := substring(COALESCE(NEW.trip_code, '') FROM '([0-9]+)$');
  v_seq := CASE
    WHEN v_seq_text IS NULL OR btrim(v_seq_text) = '' THEN 0
    ELSE v_seq_text::bigint
  END;
  v_seq := GREATEST(v_seq, v_max_existing + 1);

  LOOP
    v_candidate := public.format_org_local_seq_label('TRP', v_seq);

    SELECT EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.organization_id = NEW.organization_id
        AND t.trip_number = v_candidate
    ) INTO v_taken;

    EXIT WHEN NOT v_taken;

    v_seq := v_seq + 1;
    v_tries := v_tries + 1;
    IF v_tries > 80 THEN
      v_candidate := public.get_safe_fallback_trip_number();
      EXIT;
    END IF;
  END LOOP;

  IF NEW.trip_number IS NULL
     OR btrim(NEW.trip_number) = ''
     OR EXISTS (
       SELECT 1
       FROM public.trips t
       WHERE t.organization_id = NEW.organization_id
         AND t.trip_number = NEW.trip_number
     )
  THEN
    NEW.trip_number := v_candidate;
  END IF;

  IF NEW.display_trip_id IS NULL OR btrim(NEW.display_trip_id) = '' THEN
    NEW.display_trip_id := NEW.trip_number;
  END IF;

  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := v_seq;
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

  INSERT INTO public.organization_counters (organization_id, trip_seq)
  VALUES (NEW.organization_id, v_seq)
  ON CONFLICT (organization_id) DO UPDATE
    SET trip_seq = GREATEST(public.organization_counters.trip_seq, EXCLUDED.trip_seq);

  INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
  VALUES (NEW.organization_id, 'trip', v_seq)
  ON CONFLICT (organization_id, entity_type) DO UPDATE
    SET current_value = GREATEST(public.operational_sequences.current_value, EXCLUDED.current_value),
        updated_at = now();

  PERFORM public.log_operational_sequence_milestone(
    NEW.organization_id, 'trip', v_seq, NEW.trip_number
  );

  RETURN NEW;
END;
$function$;
