-- Replays the simulated-status chat path on a throwaway schema.
-- Asserts one trips write, one status-audit row, the simulated chat tag,
-- and that driver_command / business_simulation_revoked are left alone.
-- Prints before/after write counts for the old nested UPDATE and the new path.

CREATE TABLE trips (
  id uuid PRIMARY KEY,
  organization_id uuid,
  status text,
  status_change_origin text,
  driver_id uuid,
  driver_display_name text,
  vehicle_display_number text,
  pickup_area text,
  drop_location text,
  trip_number text,
  client_id uuid,
  supplier_id uuid
);

CREATE TABLE trip_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  organization_id uuid,
  party_type text
);

CREATE TABLE trip_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  content text,
  metadata jsonb
);

CREATE TABLE trip_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid,
  status_from text,
  status_to text
);

CREATE TABLE trip_write_log (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid,
  status text,
  origin text,
  label text
);

CREATE TABLE broadcast_log (
  trip_id uuid,
  content text,
  simulated boolean
);

CREATE OR REPLACE FUNCTION fn_trip_status_chat_message_body(p trips)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE p.status
    WHEN 'in_progress' THEN 'heading to pickup'
    WHEN 'in_transit' THEN 'in transit'
    WHEN 'completed' THEN 'completed'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION fn_ensure_trip_party_conversations(p_trip_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO trip_conversations (trip_id, party_type)
  SELECT p_trip_id, 'client'
  WHERE NOT EXISTS (SELECT 1 FROM trip_conversations WHERE trip_id = p_trip_id);
END;
$$;

CREATE OR REPLACE FUNCTION fn_post_system_message_to_trip_chats(
  p_trip_id uuid, p_content text, p_dedupe_status text, p_simulated boolean
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO broadcast_log VALUES (p_trip_id, p_content, p_simulated);
  INSERT INTO trip_messages (conversation_id, content, metadata)
  SELECT id, p_content, jsonb_build_object('simulated', p_simulated, 'status', p_dedupe_status)
  FROM trip_conversations WHERE trip_id = p_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_post_trip_feedback_prompt_to_chats(p_trip_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO broadcast_log VALUES (p_trip_id, 'feedback', false);
END;
$$;

CREATE OR REPLACE FUNCTION log_trip_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO trip_status_audit (trip_id, status_from, status_to)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION log_trip_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO trip_write_log (trip_id, status, origin, label)
  VALUES (NEW.id, NEW.status, NEW.status_change_origin, current_setting('pulse.measure_label', true));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trip_status_audit
  AFTER UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION log_trip_status_change();

CREATE TRIGGER trg_trip_write_log
  AFTER UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION log_trip_write();

-- Old broadcast: nested UPDATE. Installed first so the measurement can compare.
CREATE OR REPLACE FUNCTION fn_broadcast_trip_status_to_chat()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_msg text;
  v_simulated boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  v_msg := fn_trip_status_chat_message_body(NEW);
  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;
  v_simulated := coalesce(NEW.status_change_origin, '') = 'business_simulated';
  IF v_simulated THEN
    v_msg := v_msg || ' (simulated)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_conversations WHERE trip_id = NEW.id) THEN
    PERFORM fn_ensure_trip_party_conversations(NEW.id);
  END IF;
  PERFORM fn_post_system_message_to_trip_chats(NEW.id, v_msg, NEW.status, v_simulated);
  IF v_simulated THEN
    UPDATE trips SET status_change_origin = NULL WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trip_status_to_chat
  AFTER INSERT OR UPDATE OF status ON trips
  FOR EACH ROW EXECUTE FUNCTION fn_broadcast_trip_status_to_chat();

INSERT INTO trips (id, status, trip_number)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'assigned', 'TRP1');

SELECT set_config('pulse.measure_label', 'before', false);
SELECT pg_stat_reset();
SELECT pg_current_wal_lsn() AS before_wal \gset
UPDATE trips
SET status = 'in_progress', status_change_origin = 'business_simulated'
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT
  'before' AS phase,
  (SELECT count(*) FROM trip_write_log WHERE label = 'before') AS trip_updates,
  (SELECT count(*) FROM trip_status_audit) AS audit_rows,
  (SELECT content FROM broadcast_log WHERE trip_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' ORDER BY ctid DESC LIMIT 1) AS chat,
  (SELECT status_change_origin FROM trips WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS stored_origin,
  (SELECT n_tup_upd FROM pg_stat_user_tables WHERE relname = 'trips') AS tup_upd,
  pg_wal_lsn_diff(pg_current_wal_lsn(), :'before_wal') AS wal_bytes;

-- Replace with the migration's functions. Stubs above satisfy its calls.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

BEGIN;
\ir ../../supabase/migrations/20271111143000_clear_simulated_status_origin_without_second_update.sql
COMMIT;

INSERT INTO trips (id, status, trip_number)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'assigned', 'TRP2'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'assigned', 'TRP3'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'assigned', 'TRP4'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'in_progress', 'TRP5'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'assigned', 'TRP6');

SELECT set_config('pulse.measure_label', 'after', false);
SELECT pg_stat_reset();
SELECT pg_current_wal_lsn() AS after_wal \gset
UPDATE trips
SET status = 'in_progress', status_change_origin = 'business_simulated'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT
  'after' AS phase,
  (SELECT count(*) FROM trip_write_log WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') AS trip_updates,
  (SELECT count(*) FROM trip_status_audit WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') AS audit_rows,
  (SELECT content FROM broadcast_log WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND content <> 'feedback') AS chat,
  (SELECT simulated FROM broadcast_log WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND content <> 'feedback') AS simulated,
  (SELECT status_change_origin FROM trips WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') AS stored_origin,
  current_setting('pulse.trip_status_simulated_id', true) AS guc_after,
  (SELECT n_tup_upd FROM pg_stat_user_tables WHERE relname = 'trips') AS tup_upd,
  pg_wal_lsn_diff(pg_current_wal_lsn(), :'after_wal') AS wal_bytes;

UPDATE trips
SET status = 'in_transit', status_change_origin = 'driver_command'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

UPDATE trips
SET status = 'in_progress', status_change_origin = 'business_simulation_revoked'
WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

UPDATE trips
SET status = 'in_progress', status_change_origin = 'business_simulated'
WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

UPDATE trips
SET status = 'at_drop', status_change_origin = 'business_simulated'
WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

BEGIN;
UPDATE trips
SET status = 'completed', status_change_origin = 'business_simulated'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE trips
SET status = 'completed'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT current_setting('pulse.trip_status_simulated_id', true) AS guc_mid_transaction;
COMMIT;

DO $$
DECLARE
  v_updates int;
  v_audit int;
  v_chat text;
  v_origin text;
BEGIN
  SELECT count(*) INTO v_updates FROM trip_write_log
  WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND label = 'after' AND status = 'in_progress';
  IF v_updates <> 1 THEN
    RAISE EXCEPTION 'simulated status wrote % trip versions, expected 1', v_updates;
  END IF;

  SELECT count(*) INTO v_audit FROM trip_status_audit
  WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND status_to = 'in_progress';
  IF v_audit <> 1 THEN
    RAISE EXCEPTION 'expected 1 audit row, found %', v_audit;
  END IF;

  SELECT content INTO v_chat FROM broadcast_log
  WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND content LIKE 'heading to pickup%';
  IF v_chat IS DISTINCT FROM 'heading to pickup (simulated)' THEN
    RAISE EXCEPTION 'chat copy was %', v_chat;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND simulated IS TRUE
  ) THEN
    RAISE EXCEPTION 'simulated flag was not passed to chat';
  END IF;

  SELECT status_change_origin INTO v_origin FROM trips WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF v_origin IS NOT NULL THEN
    RAISE EXCEPTION 'simulated origin was stored as %', v_origin;
  END IF;

  IF current_setting('pulse.trip_status_simulated_id', true) NOT IN ('', NULL) THEN
    RAISE EXCEPTION 'simulated marker leaked: %', current_setting('pulse.trip_status_simulated_id', true);
  END IF;

  SELECT status_change_origin INTO v_origin FROM trips WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  IF v_origin IS DISTINCT FROM 'driver_command' THEN
    RAISE EXCEPTION 'driver_command origin became %', v_origin;
  END IF;
  IF EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND content LIKE '%(simulated)%'
  ) THEN
    RAISE EXCEPTION 'driver_command broadcast was tagged simulated';
  END IF;

  SELECT status_change_origin INTO v_origin FROM trips WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF v_origin IS DISTINCT FROM 'business_simulation_revoked' THEN
    RAISE EXCEPTION 'revoke origin became %', v_origin;
  END IF;

  SELECT status_change_origin INTO v_origin FROM trips WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  IF v_origin IS DISTINCT FROM 'business_simulated' THEN
    RAISE EXCEPTION 'unchanged status cleared origin to %', v_origin;
  END IF;
  IF (SELECT count(*) FROM trip_write_log WHERE trip_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 1 THEN
    RAISE EXCEPTION 'unchanged status wrote extra trip versions';
  END IF;

  SELECT status_change_origin INTO v_origin FROM trips WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  IF v_origin IS DISTINCT FROM 'business_simulated' THEN
    RAISE EXCEPTION 'status without a chat body cleared origin to %', v_origin;
  END IF;

  IF EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      AND content = 'in transit (simulated)'
  ) THEN
    RAISE EXCEPTION 'a later trip in the same transaction inherited the simulated marker';
  END IF;
END $$;

-- A broadcast error must not leave the marker for the next statement.
CREATE OR REPLACE FUNCTION fn_post_system_message_to_trip_chats(
  p_trip_id uuid, p_content text, p_dedupe_status text, p_simulated boolean
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_trip_id = '12121212-1212-4121-8121-121212121212' THEN
    RAISE EXCEPTION 'broadcast failed';
  END IF;
  INSERT INTO broadcast_log VALUES (p_trip_id, p_content, p_simulated);
END;
$$;

INSERT INTO trips (id, status, trip_number)
VALUES
  ('12121212-1212-4121-8121-121212121212', 'assigned', 'TRP-ERR'),
  ('13131313-1313-4131-8131-131313131313', 'assigned', 'TRP-NEXT');

DO $$
BEGIN
  UPDATE trips
  SET status = 'in_progress', status_change_origin = 'business_simulated'
  WHERE id = '12121212-1212-4121-8121-121212121212';
  RAISE EXCEPTION 'broadcast should have failed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%broadcast failed%' THEN
    RAISE;
  END IF;
END $$;

DO $$
BEGIN
  IF coalesce(current_setting('pulse.trip_status_simulated_id', true), '') <> '' THEN
    RAISE EXCEPTION 'marker survived a failed broadcast: %', current_setting('pulse.trip_status_simulated_id', true);
  END IF;

  IF (SELECT status FROM trips WHERE id = '12121212-1212-4121-8121-121212121212') IS DISTINCT FROM 'assigned'
     OR (SELECT status_change_origin FROM trips WHERE id = '12121212-1212-4121-8121-121212121212') IS NOT NULL THEN
    RAISE EXCEPTION 'failed broadcast persisted the status write';
  END IF;

  UPDATE trips
  SET status = 'in_progress'
  WHERE id = '13131313-1313-4131-8131-131313131313';

  IF EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = '13131313-1313-4131-8131-131313131313' AND coalesce(simulated, false)
  ) THEN
    RAISE EXCEPTION 'the trip after a failed broadcast was tagged simulated';
  END IF;
END $$;

DO $$
DECLARE
  i int;
  v_id uuid;
  v_writes int;
  v_start pg_lsn;
  v_wal bigint;
BEGIN
  FOR i IN 1..5 LOOP
    v_id := ('14141414-1414-4141-8141-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO trips (id, status, trip_number) VALUES (v_id, 'assigned', 'R' || i);
    v_start := pg_current_wal_lsn();
    UPDATE trips
    SET status = 'in_progress', status_change_origin = 'business_simulated'
    WHERE id = v_id;
    v_wal := pg_wal_lsn_diff(pg_current_wal_lsn(), v_start);
    SELECT count(*) INTO v_writes FROM trip_write_log WHERE trip_id = v_id;
    IF v_writes <> 1 THEN
      RAISE EXCEPTION 'repeat % wrote % versions', i, v_writes;
    END IF;
    IF (SELECT status_change_origin FROM trips WHERE id = v_id) IS NOT NULL THEN
      RAISE EXCEPTION 'repeat % stored an origin', i;
    END IF;
    RAISE NOTICE 'repeat % wal_bytes %', i, v_wal;
  END LOOP;
END $$;

-- An early return after the marker was consumed must not leave it for the next
-- statement on the same trip. The body function agrees in production; this
-- forces the two calls in the status update to disagree.
INSERT INTO trips (id, status, trip_number)
VALUES ('17171717-1717-4171-8171-171717171717', 'assigned', 'TRP-EARLY');

CREATE TABLE body_calls (n int);
INSERT INTO body_calls VALUES (0);

CREATE OR REPLACE FUNCTION fn_trip_status_chat_message_body(p trips)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  IF p.id = '17171717-1717-4171-8171-171717171717' AND p.status = 'in_progress' THEN
    SELECT n INTO v_n FROM body_calls;
    UPDATE body_calls SET n = n + 1;
    IF v_n = 0 THEN
      RETURN 'heading to pickup';
    END IF;
    RETURN NULL;
  END IF;
  RETURN CASE p.status
    WHEN 'in_progress' THEN 'heading to pickup'
    WHEN 'in_transit' THEN 'in transit'
    ELSE NULL
  END;
END;
$$;

UPDATE trips
SET status = 'in_progress', status_change_origin = 'business_simulated'
WHERE id = '17171717-1717-4171-8171-171717171717';

DO $$
BEGIN
  IF coalesce(current_setting('pulse.trip_status_simulated_id', true), '') <> '' THEN
    RAISE EXCEPTION 'marker survived an early broadcast return: %',
      current_setting('pulse.trip_status_simulated_id', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM broadcast_log WHERE trip_id = '17171717-1717-4171-8171-171717171717'
  ) THEN
    RAISE EXCEPTION 'the empty chat body still posted a line';
  END IF;
  IF (SELECT n FROM body_calls) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'expected the body function twice during the update, saw %', (SELECT n FROM body_calls);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_trip_status_chat_message_body(p trips)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE p.status
    WHEN 'in_progress' THEN 'heading to pickup'
    WHEN 'in_transit' THEN 'in transit'
    WHEN 'completed' THEN 'completed'
    ELSE NULL
  END;
$$;

UPDATE trips
SET status = 'in_transit'
WHERE id = '17171717-1717-4171-8171-171717171717';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = '17171717-1717-4171-8171-171717171717'
      AND content LIKE '%(simulated)%'
  ) THEN
    RAISE EXCEPTION 'the same trip inherited a simulated marker after an early return';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = '17171717-1717-4171-8171-171717171717'
      AND content = 'in transit'
  ) THEN
    RAISE EXCEPTION 'the follow-up status did not post its own chat line';
  END IF;
END $$;

-- A nested status update that runs while the outer marker is still set must
-- not adopt it, and must not clear it before the outer broadcast reads it.
CREATE OR REPLACE FUNCTION fn_nested_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = '15151515-1515-4151-8151-151515151515' AND NEW.status = 'in_progress' THEN
    UPDATE trips SET status = 'in_transit' WHERE id = '16161616-1616-4161-8161-161616161616';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER a_nested_status
  AFTER UPDATE OF status ON trips
  FOR EACH ROW
  EXECUTE FUNCTION fn_nested_status();

INSERT INTO trips (id, status, trip_number) VALUES
  ('15151515-1515-4151-8151-151515151515', 'assigned', 'TRP-OUTER'),
  ('16161616-1616-4161-8161-161616161616', 'assigned', 'TRP-NESTED');

UPDATE trips
SET status = 'in_progress', status_change_origin = 'business_simulated'
WHERE id = '15151515-1515-4151-8151-151515151515';

DO $$
BEGIN
  IF coalesce(current_setting('pulse.trip_status_simulated_id', true), '') <> '' THEN
    RAISE EXCEPTION 'marker survived the outer broadcast: %',
      current_setting('pulse.trip_status_simulated_id', true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = '15151515-1515-4151-8151-151515151515'
      AND content = 'heading to pickup (simulated)' AND simulated
  ) THEN
    RAISE EXCEPTION 'nested work cleared the outer simulated marker before the chat line';
  END IF;
  IF EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = '16161616-1616-4161-8161-161616161616'
      AND content LIKE '%(simulated)%'
  ) THEN
    RAISE EXCEPTION 'the nested trip adopted the outer simulated marker';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM broadcast_log
    WHERE trip_id = '16161616-1616-4161-8161-161616161616'
      AND content = 'in transit'
  ) THEN
    RAISE EXCEPTION 'the nested trip did not post its own chat line';
  END IF;
END $$;
