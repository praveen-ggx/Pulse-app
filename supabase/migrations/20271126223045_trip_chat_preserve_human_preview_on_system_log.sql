-- Location / system_log inserts were overwriting trip_conversations.last_message_preview,
-- so dispatcher inbox looked like "only location" while human driver↔ (Vasanth ↔ Bhujesh)
-- were invisible in the list. Keep human chat preview when non-actionable system rows arrive.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sync_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_is_human boolean;
  v_counts_unread boolean;
BEGIN
  v_is_human := (
    NEW.message_type IN ('text', 'image', 'document_share', 'audio', 'file')
    AND NEW.sender_role IN ('driver', 'dispatcher', 'client', 'supplier', 'user')
  );
  v_counts_unread := public.fn_trip_message_counts_as_dispatcher_unread(
    NEW.sender_role,
    NEW.message_type
  );

  UPDATE public.trip_conversations tc
  SET
    last_message_at = CASE
      WHEN NEW.created_at IS NULL THEN tc.last_message_at
      WHEN tc.last_message_at IS NULL THEN NEW.created_at
      WHEN NEW.created_at >= tc.last_message_at THEN NEW.created_at
      ELSE tc.last_message_at
    END,
    last_message_preview = CASE
      -- Human / media chat always owns the inbox preview.
      WHEN v_is_human THEN LEFT(NEW.content, 120)
      -- Non-human (system_log / location / assignment): only set preview when empty.
      WHEN nullif(trim(coalesce(tc.last_message_preview, '')), '') IS NULL
        THEN LEFT(NEW.content, 120)
      ELSE tc.last_message_preview
    END,
    unread_dispatcher_count = CASE
      WHEN v_counts_unread THEN tc.unread_dispatcher_count + 1
      ELSE tc.unread_dispatcher_count
    END,
    updated_at = NOW()
  WHERE tc.id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_conversation_on_message() IS
  'Denorm last_message_* + unread; preserves human chat preview over location/system_log spam.';

-- Heal active lanes where denorm preview is location spam but a newer human text exists.
WITH latest_human AS (
  SELECT DISTINCT ON (tm.conversation_id)
    tm.conversation_id,
    tm.created_at,
    LEFT(tm.content, 120) AS preview
  FROM public.trip_messages tm
  WHERE tm.message_type IN ('text', 'image', 'document_share', 'audio', 'file')
    AND tm.sender_role IN ('driver', 'dispatcher', 'client', 'supplier', 'user')
    AND nullif(trim(coalesce(tm.content, '')), '') IS NOT NULL
  ORDER BY tm.conversation_id, tm.created_at DESC
)
UPDATE public.trip_conversations tc
SET
  last_message_preview = lh.preview,
  last_message_at = GREATEST(tc.last_message_at, lh.created_at),
  updated_at = NOW()
FROM latest_human lh
WHERE tc.id = lh.conversation_id
  AND (
    tc.last_message_preview ILIKE 'Driver location update%'
    OR tc.last_message_preview ILIKE 'Location ping%'
    OR tc.last_message_preview ILIKE 'Live location%'
  );
