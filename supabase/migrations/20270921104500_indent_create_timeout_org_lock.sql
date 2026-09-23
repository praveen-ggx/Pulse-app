-- Indent create was timing out in the app (12s client abort) because every
-- indent/trip/vehicle/driver insert called ensure_organization_operational_code,
-- which always took FOR UPDATE on organizations — even when the code already
-- exists. Concurrent org updates or other identity writes then blocked Share.
--
-- Also fan out indent_created notifications in one INSERT instead of a
-- per-supplier loop so broadcast cannot stall the insert.

CREATE OR REPLACE FUNCTION public.ensure_organization_operational_code(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_name text;
  v_candidate text;
  v_salt integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  SELECT operational_code, name
  INTO v_code, v_name
  FROM public.organizations
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN
    RETURN upper(btrim(v_code));
  END IF;

  SELECT operational_code, name
  INTO v_code, v_name
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN
    RETURN upper(btrim(v_code));
  END IF;

  v_salt := 0;
  LOOP
    v_candidate := public.make_operational_org_code(v_name, p_org_id, v_salt);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.operational_code = v_candidate
        AND o.id <> p_org_id
    );
    v_salt := v_salt + 1;
    IF v_salt > 100 THEN
      RAISE EXCEPTION 'Unable to allocate unique operational_code for org %', p_org_id;
    END IF;
  END LOOP;

  UPDATE public.organizations
  SET operational_code = v_candidate
  WHERE id = p_org_id;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_indent_broadcast()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_route text;
BEGIN
  IF NEW.status <> 'broadcast' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'broadcast' THEN
    RETURN NEW;
  END IF;

  v_code := COALESCE(NEW.indent_operational_code, NEW.indent_number, NEW.indent_code, 'Indent');
  v_route := public.indent_route_label(NEW);

  INSERT INTO public.network_notifications (
    organization_id, actor_org_id, event_type, title, subtitle,
    amount_meta, indent_id, quote_id, bid_id, dedupe_key, payload_json
  )
  SELECT DISTINCT
    s.other_org,
    NEW.organization_id,
    'indent_created',
    CONCAT(v_code, ' is open for bids'),
    v_route,
    NEW.supplier_target,
    NEW.id,
    NULL,
    NULL,
    CONCAT('indent_created:', NEW.id, ':', s.other_org),
    jsonb_build_object('indent_code', v_code, 'route', v_route)
  FROM (
    SELECT cr.to_organization_id AS other_org
      FROM public.connection_requests cr
     WHERE cr.from_organization_id = NEW.organization_id
       AND cr.status = 'accepted'
       AND cr.request_carrier_supplier IS TRUE
    UNION
    SELECT cr.from_organization_id AS other_org
      FROM public.connection_requests cr
     WHERE cr.to_organization_id = NEW.organization_id
       AND cr.status = 'accepted'
       AND cr.request_carrier_supplier IS TRUE
  ) s
  WHERE s.other_org IS NOT NULL
    AND s.other_org <> NEW.organization_id
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;
