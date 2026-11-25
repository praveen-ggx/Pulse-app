-- Idempotent write path for trip_workflow_events.
--
-- Why: the client used to SELECT for an existing singleton event and then INSERT. RLS only lets a
-- caller read rows of their own orgs, so when another org (or a trigger) had already recorded the
-- event the check saw nothing, the INSERT hit trip_workflow_events_idempotency_key_unique and
-- Postgres logged a 23505 error each time (~34/day on prod, harmless but noisy).
--
-- This RPC inserts with ON CONFLICT DO NOTHING so a duplicate is a quiet no-op.
-- Authorization is unchanged from the INSERT policy: the caller must be a member of p_org_id.
-- Idempotency: singleton events pass key "<trip_id>:<event_type>"; multi-occurrence events pass NULL.
-- Returns the inserted row as jsonb, or NULL when the event already existed.

CREATE OR REPLACE FUNCTION public.record_trip_workflow_event(
  p_trip_id         uuid,
  p_org_id          uuid,
  p_event_type      text,
  p_payload         jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.trip_workflow_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_trip_id IS NULL OR p_org_id IS NULL OR p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  -- Same boundary as policy "trip_workflow_org_insert".
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the organization';
  END IF;

  -- The key may only be the deterministic singleton key, never an arbitrary value.
  IF p_idempotency_key IS NOT NULL
     AND p_idempotency_key <> p_trip_id::text || ':' || p_event_type THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  INSERT INTO public.trip_workflow_events (trip_id, org_id, event_type, payload, idempotency_key)
  VALUES (p_trip_id, p_org_id, p_event_type, COALESCE(p_payload, '{}'::jsonb), p_idempotency_key)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_trip_workflow_event(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trip_workflow_event(uuid, uuid, text, jsonb, text) TO authenticated;
