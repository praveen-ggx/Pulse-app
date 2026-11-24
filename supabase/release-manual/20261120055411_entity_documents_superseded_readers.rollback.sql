-- ROLLBACK for supabase/migrations/20261120055411_entity_documents_superseded_readers.sql
-- Not a supabase/migrations file: never run by `supabase db push` or db-push-set.
-- Run by hand, only by the owner, only if that migration must be undone.
--
-- Restores the four functions exactly as they were before 20261120055411 and
-- drops the helper it added. Source of each body (verified 2026-11-20 by
-- replaying history in a throwaway Postgres 17 and comparing
-- md5(pg_get_functiondef) with production, all four identical):
--   get_compliance_summary, get_expiring_documents
--       remote version 20270915103200 (adr010_staff_rpc_gates; sibling repo,
--       placeholder file in this repo) — text from production
--       supabase_migrations.schema_migrations.statements
--   compute_compliance_score, is_compliance_blocking
--       20260828010000_compliance_documents_fix_and_extend.sql
-- The bodies below are production's pg_get_functiondef output for those
-- versions. CREATE OR REPLACE keeps existing grants. No data is changed.
--
-- Order: restore the four functions first (they stop calling the helper),
-- then drop the helper. Runs as one transaction.

begin;

CREATE OR REPLACE FUNCTION public.get_compliance_summary(p_org_id uuid)
 RETURNS TABLE(entity_type text, total_docs bigint, active_docs bigint, expired_docs bigint, expiring_7d bigint, expiring_30d bigint, pending_docs bigint, verified_docs bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    entity_type,
    COUNT(*)                                                            AS total_docs,
    COUNT(*) FILTER (WHERE status = 'active' OR status = 'verified')    AS active_docs,
    COUNT(*) FILTER (
      WHERE status = 'expired'
         OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
    )                                                                   AS expired_docs,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date >= CURRENT_DATE
        AND expiry_date <= CURRENT_DATE + INTERVAL '7 days'
        AND status NOT IN ('replaced', 'rejected')
    )                                                                   AS expiring_7d,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date >= CURRENT_DATE
        AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        AND status NOT IN ('replaced', 'rejected')
    )                                                                   AS expiring_30d,
    COUNT(*) FILTER (WHERE status = 'pending')                          AS pending_docs,
    COUNT(*) FILTER (WHERE status = 'verified')                         AS verified_docs
  FROM public.entity_documents
  WHERE organization_id = p_org_id
    AND public.is_org_staff(p_org_id)
  GROUP BY entity_type;
$function$;

CREATE OR REPLACE FUNCTION public.get_expiring_documents(p_org_id uuid, p_days_ahead integer DEFAULT 30)
 RETURNS TABLE(id uuid, entity_type text, entity_id uuid, doc_type text, doc_label text, doc_number text, expiry_date date, days_until integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    id, entity_type, entity_id, doc_type, doc_label, doc_number, expiry_date,
    (expiry_date - CURRENT_DATE)::int AS days_until,
    status
  FROM public.entity_documents
  WHERE organization_id = p_org_id
    AND expiry_date IS NOT NULL
    AND expiry_date >= CURRENT_DATE - INTERVAL '1 day'
    AND expiry_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
    AND status NOT IN ('replaced', 'rejected')
    AND public.is_org_staff(p_org_id)
  ORDER BY expiry_date ASC;
$function$;

CREATE OR REPLACE FUNCTION public.compute_compliance_score(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_required          text[];
  v_total             int;
  v_active            int;
  v_expired           int;
  v_expiring_7d       int;
  v_expiring_30d      int;
  v_verified          int;
  v_pending           int;
  v_missing           int;
  v_validity          int;
  v_completeness      int;
  v_verification      int;
  v_score             int;
  v_level             text;
BEGIN
  v_required := CASE p_entity_type
    WHEN 'vehicle'      THEN ARRAY['rc','insurance','fitness','permit','pollution']
    WHEN 'driver'       THEN ARRAY['license','medical']
    WHEN 'supplier'     THEN ARRAY['gst','pan']
    WHEN 'organization' THEN ARRAY[]::text[]
    ELSE                       ARRAY[]::text[]
  END;

  SELECT
    COUNT(*)                                                                                   ,
    COUNT(*) FILTER (WHERE status IN ('active','verified'))                                    ,
    COUNT(*) FILTER (
      WHERE status = 'expired'
         OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
    )                                                                                          ,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        AND status NOT IN ('replaced','rejected')
    )                                                                                          ,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND status NOT IN ('replaced','rejected')
    )                                                                                          ,
    COUNT(*) FILTER (WHERE status = 'verified')                                                ,
    COUNT(*) FILTER (WHERE status = 'pending')
  INTO
    v_total, v_active, v_expired, v_expiring_7d, v_expiring_30d, v_verified, v_pending
  FROM public.entity_documents
  WHERE entity_type = p_entity_type
    AND entity_id   = p_entity_id
    AND status     <> 'replaced';

  v_missing := (
    SELECT COUNT(*)
    FROM unnest(v_required) AS r(doc)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.entity_documents ed
      WHERE ed.entity_type = p_entity_type
        AND ed.entity_id   = p_entity_id
        AND ed.doc_type    = r.doc
        AND ed.status     <> 'replaced'
    )
  );

  v_validity := CASE
    WHEN v_total > 0
      THEN ROUND(((v_total - v_expired)::numeric / v_total) * 100)
    WHEN cardinality(v_required) = 0 THEN 100
    ELSE 0
  END;

  v_completeness := CASE
    WHEN cardinality(v_required) > 0
      THEN ROUND(((cardinality(v_required) - v_missing)::numeric / cardinality(v_required)) * 100)
    ELSE 100
  END;

  v_verification := CASE
    WHEN v_total > 0 THEN ROUND((v_verified::numeric / v_total) * 100)
    ELSE 100
  END;

  v_score := ROUND(v_validity * 0.40 + v_completeness * 0.35 + v_verification * 0.25);

  v_level := CASE
    WHEN v_score >= 90 THEN 'excellent'
    WHEN v_score >= 70 THEN 'good'
    WHEN v_score >= 50 THEN 'warning'
    ELSE                    'critical'
  END;

  RETURN jsonb_build_object(
    'score',              v_score,
    'level',              v_level,
    'validityScore',      v_validity,
    'completenessScore',  v_completeness,
    'verificationScore',  v_verification,
    'breakdown', jsonb_build_object(
      'total',        v_total,
      'active',       v_active,
      'expired',      v_expired,
      'expiring7d',   v_expiring_7d,
      'expiring30d',  v_expiring_30d,
      'verified',     v_verified,
      'pending',      v_pending,
      'missing',      v_missing
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_compliance_blocking(p_vehicle_id uuid DEFAULT NULL::uuid, p_driver_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reasons   jsonb := '[]'::jsonb;
  v_vehicle_required CONSTANT text[] := ARRAY['insurance','permit','fitness'];
  v_driver_required  CONSTANT text[] := ARRAY['license'];
  r RECORD;
BEGIN
  IF p_vehicle_id IS NOT NULL THEN
    -- Expired vehicle docs that count as blockers.
    FOR r IN
      SELECT doc_type, expiry_date
      FROM public.entity_documents
      WHERE entity_type = 'vehicle'
        AND entity_id   = p_vehicle_id
        AND doc_type    = ANY (v_vehicle_required)
        AND status     <> 'replaced'
        AND (
          status = 'expired'
          OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
        )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'vehicle',
        'entity_id',   p_vehicle_id,
        'doc_type',    r.doc_type,
        'reason',      'expired',
        'expiry_date', r.expiry_date
      );
    END LOOP;

    -- Missing required vehicle docs.
    FOR r IN
      SELECT d AS doc_type
      FROM unnest(v_vehicle_required) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.entity_documents ed
        WHERE ed.entity_type = 'vehicle'
          AND ed.entity_id   = p_vehicle_id
          AND ed.doc_type    = d
          AND ed.status NOT IN ('replaced', 'rejected', 'expired')
      )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'vehicle',
        'entity_id',   p_vehicle_id,
        'doc_type',    r.doc_type,
        'reason',      'missing',
        'expiry_date', NULL
      );
    END LOOP;
  END IF;

  IF p_driver_id IS NOT NULL THEN
    FOR r IN
      SELECT doc_type, expiry_date
      FROM public.entity_documents
      WHERE entity_type = 'driver'
        AND entity_id   = p_driver_id
        AND doc_type    = ANY (v_driver_required)
        AND status     <> 'replaced'
        AND (
          status = 'expired'
          OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
        )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'driver',
        'entity_id',   p_driver_id,
        'doc_type',    r.doc_type,
        'reason',      'expired',
        'expiry_date', r.expiry_date
      );
    END LOOP;

    FOR r IN
      SELECT d AS doc_type
      FROM unnest(v_driver_required) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.entity_documents ed
        WHERE ed.entity_type = 'driver'
          AND ed.entity_id   = p_driver_id
          AND ed.doc_type    = d
          AND ed.status NOT IN ('replaced', 'rejected', 'expired')
      )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'driver',
        'entity_id',   p_driver_id,
        'doc_type',    r.doc_type,
        'reason',      'missing',
        'expiry_date', NULL
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'blocked', jsonb_array_length(v_reasons) > 0,
    'reasons', v_reasons
  );
END;
$function$;


drop function if exists private.entity_document_is_superseded(uuid, text, uuid, text, timestamptz, date);

commit;
