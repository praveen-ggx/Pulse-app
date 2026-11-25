-- Allow legacy_* FK columns to be cleared (ON DELETE SET NULL) while keeping
-- conversation_type / organization_id / trip_id / channel_key / created_by immutable.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.trg_chat_conversations_immutable_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_type IS DISTINCT FROM OLD.conversation_type
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
     OR NEW.channel_key IS DISTINCT FROM OLD.channel_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'chat_conversations identity columns are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
