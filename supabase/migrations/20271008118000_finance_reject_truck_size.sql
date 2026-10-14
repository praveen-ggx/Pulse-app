-- Dhira feedback (11 Oct 2026). Sorts after 20271008117000.
--
-- 1. Truck type shows the size: get_compliance_list_trip_facts returns
--    "type · size" and get_vehicle_for_trip_viewer also returns vehicle_size.
-- 2. Finance Reject: reject_trip_compliance accepts the new surface
--    trip_compliance.finance.reject as well as Compliance's mark_verified.
--    Finance still cannot Verify; Reject still refuses when an advance or
--    balance is posted and never touches ledger rows.
-- Signatures and grants are unchanged (create or replace).

-- ── 1. Truck size ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_vehicle_for_trip_viewer(p_vehicle_id uuid, p_trip_id uuid, p_viewer_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_can_view boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_viewer_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM trips t
    WHERE t.id = p_trip_id
      AND t.vehicle_id = p_vehicle_id
      AND t.deleted_at IS NULL
      AND (
        t.organization_id = p_viewer_org_id
        OR EXISTS (
          SELECT 1 FROM suppliers s
          WHERE s.id = t.supplier_id AND s.linked_organization_id = p_viewer_org_id
        )
        OR EXISTS (
          SELECT 1 FROM clients c
          WHERE c.id = t.client_id AND c.linked_organization_id = p_viewer_org_id
        )
      )
  ) INTO v_can_view;

  IF NOT v_can_view THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id',                v.id,
      'organization_id',   v.organization_id,
      'vehicle_number',    v.vehicle_number,
      'vehicle_type',      v.vehicle_type,
      'vehicle_size',      v.vehicle_size,
      'capacity',          v.capacity,
      'vehicle_brand',     v.vehicle_brand,
      'vehicle_body_type', v.vehicle_body_type,
      'status',            v.status,
      'documents',         v.documents
    )
    FROM vehicles v
    WHERE v.id = p_vehicle_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_compliance_list_trip_facts(p_viewer_org_id uuid, p_trip_ids uuid[])
 RETURNS TABLE(trip_id uuid, vehicle_id uuid, truck_type text, supplier_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_trip_ids) > 1000 THEN
    RAISE EXCEPTION 'get_compliance_list_trip_facts: at most 1000 trip ids per call (got %)', cardinality(p_trip_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    tr.id,
    tr.vehicle_id,
    -- Truck type with size, e.g. "Open Body Truck · 32 Ft MXL" (size drives pricing).
    NULLIF(concat_ws(' · ', NULLIF(btrim(v.vehicle_type), ''), NULLIF(btrim(v.vehicle_size), '')), ''),
    CASE
      WHEN s.id IS NULL THEN NULL
      WHEN NOT (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = s.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM public.organizations ow
          WHERE ow.id = s.organization_id
            AND ow.owner_id = (SELECT auth.uid())
        )
      ) THEN NULL
      WHEN s.supplier_type = 'integrated' AND s.linked_organization_id IS NOT NULL
        THEN btrim(COALESCE(NULLIF(btrim(s.name), ''), NULLIF(btrim(lo.name), ''), s.company_name, 'Connected'))
      ELSE btrim(COALESCE(s.name, s.company_name, s.contact_person, ''))
    END
  FROM private.compliance_visible_trips(p_viewer_org_id, p_trip_ids) vt
  JOIN public.trips tr ON tr.id = vt.trip_id
  LEFT JOIN public.vehicles v ON v.id = tr.vehicle_id
  LEFT JOIN public.suppliers s ON s.id = tr.supplier_id
  LEFT JOIN public.organizations lo ON lo.id = s.linked_organization_id
  ORDER BY tr.id;
END;
$function$;

-- ── 2. Finance Reject ───────────────────────────────────────────────────────

create or replace function public.reject_trip_compliance(
  p_trip_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_org_id          uuid;
  v_verified_at     timestamptz;
  v_previous_reason text;
  v_reason          text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g');
  v_key             text := nullif(trim(p_idempotency_key), '');
  v_dest            text;
  v_payload         jsonb;
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;

  -- Compliance (mark_verified) or Finance with the dedicated reject surface.
  -- Finance does not gain Verify; posted advances / balances still refuse below.
  if v_org_id is null
     or not (
       public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified')
       or public.has_member_surface(v_org_id, 'trip_compliance.finance.reject')
     ) then
    raise exception 'not authorized to reject compliance for this trip';
  end if;

  select compliance_verified_at, compliance_decline_reason
    into v_verified_at, v_previous_reason
    from public.trips
   where id = p_trip_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'not authorized to reject compliance for this trip';
  end if;

  if v_verified_at is null then
    raise exception 'trip compliance is not verified; use decline instead';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'a reject reason between 3 and 500 characters is required';
  end if;

  -- Lock posted ledger rows, then refuse before any event or column write.
  perform 1
    from public.transactions
   where trip_id = p_trip_id
     and ledger_category in ('compliance_advance', 'compliance_balance')
   for update;

  if exists (
    select 1 from public.transactions
     where trip_id = p_trip_id
       and ledger_category in ('compliance_advance', 'compliance_balance')
  ) then
    raise exception 'an advance or balance is already posted; compliance cannot be rejected';
  end if;

  v_dest := public.compliance_reject_return_queue(v_reason);
  v_payload := jsonb_build_object(
    'reason', v_reason,
    'previous_reason', v_previous_reason,
    'mode', 'reject_verified',
    'return_to', v_dest
  );

  if v_key is not null then
    begin
      insert into public.trip_workflow_events
        (trip_id, org_id, actor_id, event_type, payload, idempotency_key)
      values
        (p_trip_id, v_org_id, v_uid, 'compliance.rejected', v_payload,
         p_trip_id::text || ':compliance.rejected:' || v_key);
    exception when unique_violation then
      return;
    end;
  else
    insert into public.trip_workflow_events
      (trip_id, org_id, actor_id, event_type, payload)
    values
      (p_trip_id, v_org_id, v_uid, 'compliance.rejected', v_payload);
  end if;

  -- compliance_verified_at stays. A later decline time reopens the inbox
  -- even if compliance_resubmitted_at is already set.
  update public.trips
     set compliance_declined_at = now(),
         compliance_declined_by = v_uid,
         compliance_decline_reason = v_reason,
         compliance_reject_return_to = v_dest,
         finance_verified_at = null,
         finance_verified_by = null,
         finance_flagged_at = null,
         finance_flagged_by = null,
         finance_flag_note = null
   where id = p_trip_id;
end;
$$;
