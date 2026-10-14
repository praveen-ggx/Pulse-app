-- Freight route stops for native indents and trips.
-- Sequence is the route order. Existing pickup_area / drop_location columns stay
-- the summary pair. No backfill: rows with no stops keep using those columns.

CREATE TABLE public.indent_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id uuid NOT NULL REFERENCES public.indents(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  stop_type text NOT NULL,
  location_label text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT indent_stops_sequence_nonnegative CHECK (sequence >= 0),
  CONSTRAINT indent_stops_stop_type_check CHECK (stop_type IN ('pickup', 'drop')),
  CONSTRAINT indent_stops_location_label_not_blank CHECK (char_length(btrim(location_label)) > 0),
  CONSTRAINT indent_stops_indent_id_sequence_key UNIQUE (indent_id, sequence)
);

COMMENT ON TABLE public.indent_stops IS
  'Ordered pickup and drop points for a freight indent. Route order is sequence, not insert time. When no rows exist, indents.pickup_area and indents.drop_location remain the route.';

COMMENT ON COLUMN public.indent_stops.sequence IS
  'Zero-based route order. All pickups, then all drops, in the order the user entered.';

CREATE INDEX indent_stops_indent_id_idx ON public.indent_stops (indent_id);

CREATE TRIGGER set_indent_stops_updated_at
  BEFORE UPDATE ON public.indent_stops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.indent_stops ENABLE ROW LEVEL SECURITY;

-- Read when the parent indent is visible under indents RLS (org, supplier, and
-- any other existing indent select policy). No extra public access.
CREATE POLICY indent_stops_select
  ON public.indent_stops
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.indents i
      WHERE i.id = indent_stops.indent_id
    )
  );

-- Write when the caller is an active member of the indent's organization and
-- is not ground ops. Matches the current indent manage exclusion.
CREATE POLICY indent_stops_manage
  ON public.indent_stops
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.indents i
      WHERE i.id = indent_stops.indent_id
        AND public.is_org_member(i.organization_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = i.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
            AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.indents i
      WHERE i.id = indent_stops.indent_id
        AND public.is_org_member(i.organization_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = i.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
            AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
        )
    )
  );

REVOKE ALL ON TABLE public.indent_stops FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.indent_stops TO authenticated;

GRANT ALL ON TABLE public.indent_stops TO service_role;

CREATE TABLE public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  stop_type text NOT NULL,
  location_label text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_stops_sequence_nonnegative CHECK (sequence >= 0),
  CONSTRAINT trip_stops_stop_type_check CHECK (stop_type IN ('pickup', 'drop')),
  CONSTRAINT trip_stops_location_label_not_blank CHECK (char_length(btrim(location_label)) > 0),
  CONSTRAINT trip_stops_trip_id_sequence_key UNIQUE (trip_id, sequence)
);

COMMENT ON TABLE public.trip_stops IS
  'Ordered pickup and drop points for a freight trip. Route order is sequence, not insert time. When no rows exist, trips.pickup_area and trips.drop_location remain the route.';

COMMENT ON COLUMN public.trip_stops.sequence IS
  'Zero-based route order. Copied from the indent stop list when a trip is created in a later step.';

CREATE INDEX trip_stops_trip_id_idx ON public.trip_stops (trip_id);

CREATE TRIGGER set_trip_stops_updated_at
  BEFORE UPDATE ON public.trip_stops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_stops_select
  ON public.trip_stops
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_stops.trip_id
    )
  );

CREATE POLICY trip_stops_manage
  ON public.trip_stops
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND public.is_org_member(t.organization_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = t.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
            AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_stops.trip_id
        AND public.is_org_member(t.organization_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = t.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
            AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
        )
    )
  );

REVOKE ALL ON TABLE public.trip_stops FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_stops TO authenticated;

GRANT ALL ON TABLE public.trip_stops TO service_role;
