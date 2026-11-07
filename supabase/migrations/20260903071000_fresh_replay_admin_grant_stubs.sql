-- Fresh-install repair for 20260903072324_admindata_admin_access.sql.
-- That file revokes and grants four functions that this repository creates
-- later. Existing databases already have the real functions, so each stub is
-- created only when that exact signature is missing and is never replaced.
-- The later creator migrations use CREATE OR REPLACE and keep these grants.
--
-- chat_conversations is created here, verbatim from
-- 20260917000000_pulse_chat_platform_foundation.sql, because
-- fn_ensure_trip_chat_room_core returns that table and the table does not
-- exist yet. The later CREATE TABLE IF NOT EXISTS then changes nothing.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid        NOT NULL,
  conversation_type               text        NOT NULL CHECK (conversation_type IN
    ('direct','direct_org','trip','trip_lane','customer','supplier','channel','system')),
  title                           text,
  trip_id                         uuid        REFERENCES public.trips(id)     ON DELETE CASCADE,
  client_id                       uuid        REFERENCES public.clients(id)   ON DELETE SET NULL,
  supplier_id                     uuid        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  driver_id                       uuid        REFERENCES public.drivers(id)   ON DELETE SET NULL,
  channel_key                     text,
  created_by                      uuid        REFERENCES auth.users(id),
  is_archived                     boolean     NOT NULL DEFAULT false,
  last_message_at                 timestamptz,
  last_message_preview            text,
  message_count                   integer     NOT NULL DEFAULT 0,
  metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  legacy_trip_conversation_id     uuid        UNIQUE REFERENCES public.trip_conversations(id)    ON DELETE SET NULL,
  legacy_network_conversation_id  uuid        UNIQUE REFERENCES public.network_conversations(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF to_regprocedure('public.emit_network_notification(uuid,uuid,text,text,text,numeric,uuid,uuid,uuid,text,jsonb)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.emit_network_notification(
        uuid, uuid, text, text, text, numeric, uuid, uuid, uuid, text, jsonb
      ) RETURNS void
      LANGUAGE plpgsql
      AS $body$ BEGIN RETURN; END; $body$
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.emit_network_notification(uuid,uuid,text,text,text,numeric,uuid,uuid,uuid,text,jsonb) FROM PUBLIC';
  END IF;

  IF to_regprocedure('public.platform_next_canonical_code(text,integer)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.platform_next_canonical_code(text, integer)
      RETURNS text
      LANGUAGE sql
      AS $body$ SELECT NULL::text $body$
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.platform_next_canonical_code(text,integer) FROM PUBLIC';
  END IF;

  IF to_regprocedure('public.fn_ensure_trip_chat_room_core(uuid,uuid)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.fn_ensure_trip_chat_room_core(uuid, uuid)
      RETURNS public.chat_conversations
      LANGUAGE sql
      AS $body$ SELECT NULL::public.chat_conversations $body$
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ensure_trip_chat_room_core(uuid,uuid) FROM PUBLIC';
  END IF;

  IF to_regprocedure('public._ensure_mover_asset_trip(uuid,uuid,uuid,text,uuid)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public._ensure_mover_asset_trip(uuid, uuid, uuid, text, uuid)
      RETURNS void
      LANGUAGE plpgsql
      AS $body$ BEGIN RETURN; END; $body$
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public._ensure_mover_asset_trip(uuid,uuid,uuid,text,uuid) FROM PUBLIC';
  END IF;
END
$guard$;
