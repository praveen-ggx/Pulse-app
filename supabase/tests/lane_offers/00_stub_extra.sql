-- Objects the lane offers migration reads that pooled_marketplace/00_stub_schema.sql
-- does not provide. Disposable local Postgres only.

ALTER TABLE public.profiles ADD COLUMN full_name text;

CREATE TABLE public.network_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_org_id uuid,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  subtitle text,
  amount_meta numeric,
  indent_id uuid,
  quote_id uuid,
  bid_id uuid,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_notifications_no_self_notify CHECK (
    actor_org_id IS NULL OR actor_org_id <> organization_id
  )
);
CREATE UNIQUE INDEX network_notifications_dedupe_uidx
  ON public.network_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- verbatim: 20270211160000_network_notifications.sql
CREATE OR REPLACE FUNCTION public.emit_network_notification(
  p_organization_id uuid,
  p_actor_org_id uuid,
  p_event_type text,
  p_title text,
  p_subtitle text,
  p_amount_meta numeric,
  p_indent_id uuid,
  p_quote_id uuid,
  p_bid_id uuid,
  p_dedupe_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;
  IF p_actor_org_id IS NOT NULL AND p_actor_org_id = p_organization_id THEN
    RETURN;
  END IF;

  INSERT INTO public.network_notifications (
    organization_id, actor_org_id, event_type, title, subtitle,
    amount_meta, indent_id, quote_id, bid_id, dedupe_key, payload_json
  ) VALUES (
    p_organization_id, p_actor_org_id, p_event_type, p_title, p_subtitle,
    p_amount_meta, p_indent_id, p_quote_id, p_bid_id, p_dedupe_key,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_network_notification(
  uuid, uuid, text, text, text, numeric, uuid, uuid, uuid, text, jsonb
) FROM PUBLIC;
