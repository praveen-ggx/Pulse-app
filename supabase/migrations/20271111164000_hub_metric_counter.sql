-- Boundary A. Repository artifact only.
-- The projection trigger is created disabled. Nothing in this file enables it
-- or changes mover synchronization.
-- get_org_hub_metrics_counter is not called by the application.
--
-- Missing counter rows raise SQLSTATE P0H01 (hub_metric_missing_counter).
-- That is the only application exception this projection swallows.
-- A generic RAISE from any other function propagates.

SET LOCAL lock_timeout = '5s';

CREATE TABLE public.hub_metric_counter (
  organization_id uuid NOT NULL,
  bucket text NOT NULL,
  stripe smallint NOT NULL,
  n bigint NOT NULL,
  touched_at timestamptz,
  PRIMARY KEY (organization_id, bucket, stripe),
  CONSTRAINT hub_metric_counter_bucket_check CHECK (
    bucket IN (
      'active', 'history', 'cancelled', 'unassigned',
      'assigned', 'loading', 'in_transit', 'unloading'
    )
  ),
  CONSTRAINT hub_metric_counter_stripe_check CHECK (stripe BETWEEN 0 AND 15),
  CONSTRAINT hub_metric_counter_n_nonneg CHECK (n >= 0)
);

CREATE TABLE public.hub_metric_fault (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid,
  trip_id uuid,
  sqlstate text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.hub_metric_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_metric_fault ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hub_metric_counter FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hub_metric_fault FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hub_metric_counter TO service_role;
GRANT ALL ON TABLE public.hub_metric_fault TO service_role;

COMMENT ON TABLE public.hub_metric_counter IS
  'All-time Hub bucket counts, 16 stripes per organization. Maintained only by the disabled projection and reconciliation. Not a client read surface.';

-- Immutable placement. md5 does not move a trip onto another stripe across a PostgreSQL major upgrade.
CREATE FUNCTION public.hub_metric_stripe(p_trip_id uuid)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT ((('x' || substr(md5(p_trip_id::text), 1, 8))::bit(32)::int & 2147483647) % 16)::smallint
$$;

COMMENT ON FUNCTION public.hub_metric_stripe(uuid) IS
  'Stripe 0..15 for every bucket of one trip. Shared by the projection and reconciliation.';

-- Frozen Hub contribution. Soft-deleted trips contribute nowhere.
-- A linked supplier counts only with indent_id and no live mover_asset mirror.
-- History is Delivered. Unloading includes at-destination trips with or without a document.
CREATE FUNCTION public.hub_metric_contrib(tr public.trips)
RETURNS TABLE(organization_id uuid, bucket text)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT o.organization_id, b.bucket
  FROM (
    SELECT tr.organization_id
    WHERE tr.deleted_at IS NULL
      AND tr.organization_id IS NOT NULL
    UNION
    SELECT s.linked_organization_id
    FROM public.suppliers s
    WHERE tr.deleted_at IS NULL
      AND tr.supplier_id IS NOT NULL
      AND tr.indent_id IS NOT NULL
      AND s.id = tr.supplier_id
      AND s.linked_organization_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.trips m
        WHERE m.organization_id = s.linked_organization_id
          AND m.source = 'mover_asset'
          AND m.source_indent_id = tr.indent_id
          AND m.deleted_at IS NULL
      )
  ) o
  CROSS JOIN LATERAL (
    SELECT x.bucket
    FROM (
      SELECT 'active'::text AS bucket
      WHERE lower(coalesce(tr.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
      UNION ALL
      SELECT 'history'
      WHERE lower(coalesce(tr.status, '')) IN ('completed', 'delivered', 'done')
      UNION ALL
      SELECT 'cancelled'
      WHERE lower(coalesce(tr.status, '')) = 'cancelled'
      UNION ALL
      SELECT 'unassigned'
      WHERE lower(coalesce(tr.status, '')) NOT IN ('completed', 'delivered', 'done')
        AND (
          tr.driver_id IS NULL
          OR lower(coalesce(tr.status, '')) IN ('cancelled', 'draft')
        )
      UNION ALL
      SELECT 'assigned'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) = 'assigned'
      UNION ALL
      SELECT 'loading'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) IN ('picked_up', 'pickup', 'in_progress')
      UNION ALL
      SELECT 'in_transit'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) IN ('in_transit', 'dispatched', 'transit')
      UNION ALL
      SELECT 'unloading'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
    ) x
  ) b
$$;

CREATE FUNCTION public.hub_metric_transition_deltas(p_old public.trips, p_new public.trips)
RETURNS TABLE(organization_id uuid, bucket text, delta integer)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT d.organization_id, d.bucket, sum(d.delta)::integer
  FROM (
    SELECT c.organization_id, c.bucket, -1 AS delta
    FROM (SELECT p_old AS tr WHERE p_old.id IS NOT NULL) old_row
    CROSS JOIN LATERAL public.hub_metric_contrib(old_row.tr) c
    UNION ALL
    SELECT c.organization_id, c.bucket, 1
    FROM (SELECT p_new AS tr WHERE p_new.id IS NOT NULL) new_row
    CROSS JOIN LATERAL public.hub_metric_contrib(new_row.tr) c
  ) d
  GROUP BY d.organization_id, d.bucket
  HAVING sum(d.delta) <> 0
$$;

CREATE FUNCTION public.hub_project_metric_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  k record;
  v_trip uuid;
  v_org uuid;
  v_stripe smallint;
  v_locked integer;
BEGIN
  v_trip := COALESCE(NEW.id, OLD.id);
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  v_stripe := public.hub_metric_stripe(v_trip);

  IF NOT EXISTS (
    SELECT 1 FROM public.hub_metric_transition_deltas(OLD, NEW)
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    FOR k IN
      SELECT organization_id, bucket, delta
      FROM public.hub_metric_transition_deltas(OLD, NEW)
      ORDER BY organization_id, bucket, v_stripe
    LOOP
      SELECT 1 INTO v_locked
      FROM public.hub_metric_counter c
      WHERE c.organization_id = k.organization_id
        AND c.bucket = k.bucket
        AND c.stripe = v_stripe
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'hub_metric_missing_counter'
          USING ERRCODE = 'P0H01';
      END IF;
    END LOOP;

    FOR k IN
      SELECT organization_id, bucket, delta
      FROM public.hub_metric_transition_deltas(OLD, NEW)
      ORDER BY organization_id, bucket, v_stripe
    LOOP
      UPDATE public.hub_metric_counter c
      SET n = c.n + k.delta,
          touched_at = pg_catalog.clock_timestamp()
      WHERE c.organization_id = k.organization_id
        AND c.bucket = k.bucket
        AND c.stripe = v_stripe;
    END LOOP;
  EXCEPTION
    WHEN lock_not_available
      OR unique_violation
      OR foreign_key_violation
      OR not_null_violation
      OR check_violation
      OR exclusion_violation
      OR deadlock_detected
      OR SQLSTATE 'P0H01'
    THEN
      BEGIN
        INSERT INTO public.hub_metric_fault (organization_id, trip_id, sqlstate)
        VALUES (v_org, v_trip, SQLSTATE);
      EXCEPTION
        WHEN SQLSTATE '57014'
          OR SQLSTATE '57P01'
          OR SQLSTATE '57P02'
          OR SQLSTATE '57P03'
        THEN
          RAISE;
        WHEN unique_violation
          OR foreign_key_violation
          OR not_null_violation
          OR check_violation
          OR exclusion_violation
        THEN
          RAISE WARNING 'hub_metric_fault_log_failed: %', SQLERRM;
      END;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Name sorts after commerce, mover, room, audit, chat, and assignment audit.
CREATE TRIGGER zzz_hub_project
AFTER INSERT OR UPDATE OR DELETE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.hub_project_metric_counters();

ALTER TABLE public.trips DISABLE TRIGGER zzz_hub_project;

COMMENT ON FUNCTION public.hub_project_metric_counters() IS
  'Disabled Hub projection. Catchable faults roll back this firing''s counter deltas and let the trip statement continue. Query cancellation, shutdown, and any other exception propagate.';

-- Absolute per-stripe repair. Does not place an organization total on stripe 0.
CREATE FUNCTION public.hub_reconcile_org_metric_counters(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  rec record;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'hub_reconcile_org_required';
  END IF;

  PERFORM 1
  FROM public.hub_metric_counter c
  WHERE c.organization_id = p_org
  ORDER BY c.bucket, c.stripe
  FOR UPDATE;

  FOR rec IN
    SELECT b.bucket, s.stripe, COALESCE(cl.n, 0) AS n
    FROM (
      VALUES
        ('active'), ('history'), ('cancelled'), ('unassigned'),
        ('assigned'), ('loading'), ('in_transit'), ('unloading')
    ) AS b(bucket)
    CROSS JOIN generate_series(0, 15) AS s(stripe)
    LEFT JOIN (
      SELECT c.bucket, public.hub_metric_stripe(t.id) AS stripe, count(*)::bigint AS n
      FROM public.trips t
      CROSS JOIN LATERAL public.hub_metric_contrib(t) c
      WHERE c.organization_id = p_org
      GROUP BY c.bucket, public.hub_metric_stripe(t.id)
    ) cl ON cl.bucket = b.bucket AND cl.stripe = s.stripe
    ORDER BY b.bucket, s.stripe
  LOOP
    INSERT INTO public.hub_metric_counter (organization_id, bucket, stripe, n, touched_at)
    VALUES (p_org, rec.bucket, rec.stripe, rec.n, pg_catalog.clock_timestamp())
    ON CONFLICT (organization_id, bucket, stripe)
    DO UPDATE SET n = EXCLUDED.n, touched_at = pg_catalog.clock_timestamp();
  END LOOP;
END;
$$;

-- Backfill and recovery. One organization at a time, in organization_id order.
-- The projection does not call this.
CREATE FUNCTION public.hub_reconcile_metric_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN
    SELECT organization_id
    FROM (
      SELECT o.id AS organization_id FROM public.organizations o
      UNION
      SELECT t.organization_id FROM public.trips t
      UNION
      SELECT s.linked_organization_id
      FROM public.suppliers s
      WHERE s.linked_organization_id IS NOT NULL
      UNION
      SELECT c.organization_id FROM public.hub_metric_counter c
    ) orgs
    WHERE organization_id IS NOT NULL
    ORDER BY organization_id
  LOOP
    PERFORM public.hub_reconcile_org_metric_counters(v_org);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.hub_reconcile_org_metric_counters(uuid) IS
  'Locks one organization''s counter rows, classifies current trips onto hub_metric_stripe(trip id), and stores those absolute counts.';

-- Shadow oracle. Same classifier as the counter. Operators only; the client does not call it.
CREATE FUNCTION public.hub_org_metric_oracle(p_org uuid)
RETURNS TABLE(
  active bigint,
  history bigint,
  cancelled bigint,
  unassigned bigint,
  assigned bigint,
  loading bigint,
  in_transit bigint,
  unloading bigint
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    count(*) FILTER (WHERE c.bucket = 'active'),
    count(*) FILTER (WHERE c.bucket = 'history'),
    count(*) FILTER (WHERE c.bucket = 'cancelled'),
    count(*) FILTER (WHERE c.bucket = 'unassigned'),
    count(*) FILTER (WHERE c.bucket = 'assigned'),
    count(*) FILTER (WHERE c.bucket = 'loading'),
    count(*) FILTER (WHERE c.bucket = 'in_transit'),
    count(*) FILTER (WHERE c.bucket = 'unloading')
  FROM public.trips t
  CROSS JOIN LATERAL public.hub_metric_contrib(t) c
  WHERE c.organization_id = p_org
$$;

-- Unread. All-time member buckets only. Date windows, ground-ops, and sourcing do not use this sum.
CREATE FUNCTION public.get_org_hub_metrics_counter(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') IN ('ground_ops', 'sourcing')
  ) THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'trips_active', COALESCE(sum(n) FILTER (WHERE bucket = 'active'), 0),
      'trips_completed', COALESCE(sum(n) FILTER (WHERE bucket = 'history'), 0),
      'trips_cancelled', COALESCE(sum(n) FILTER (WHERE bucket = 'cancelled'), 0),
      'unassigned', COALESCE(sum(n) FILTER (WHERE bucket = 'unassigned'), 0),
      'assigned', COALESCE(sum(n) FILTER (WHERE bucket = 'assigned'), 0),
      'loading', COALESCE(sum(n) FILTER (WHERE bucket = 'loading'), 0),
      'in_transit', COALESCE(sum(n) FILTER (WHERE bucket = 'in_transit'), 0),
      'unloading', COALESCE(sum(n) FILTER (WHERE bucket = 'unloading'), 0)
    )
    FROM public.hub_metric_counter
    WHERE organization_id = p_org_id
  );
END;
$$;

COMMENT ON FUNCTION public.get_org_hub_metrics_counter(uuid) IS
  'Sum of the 16 Hub stripes for an all-time member. Returns NULL for non-members, ground_ops, and sourcing. Does not scan trips.';

REVOKE ALL ON FUNCTION public.hub_metric_stripe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_metric_contrib(public.trips) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_metric_transition_deltas(public.trips, public.trips) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_project_metric_counters() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_reconcile_org_metric_counters(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_reconcile_metric_counters() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_org_metric_oracle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_hub_metrics_counter(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hub_reconcile_org_metric_counters(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hub_reconcile_metric_counters() TO service_role;
GRANT EXECUTE ON FUNCTION public.hub_org_metric_oracle(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_org_hub_metrics_counter(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
