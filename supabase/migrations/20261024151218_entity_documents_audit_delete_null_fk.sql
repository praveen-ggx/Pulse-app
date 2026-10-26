-- AFTER DELETE on entity_documents inserted document_audit_log.document_id =
-- OLD.id. That row is already gone, so document_audit_log_document_id_fkey
-- rejected the insert and rolled the delete back.
--
-- This file replaces only entity_documents_audit_trigger(). It does not
-- DROP/CREATE the trigger. Rollback = restore the previous function body;
-- that re-breaks deletes and cannot restore deleted rows or un-NULL audit FKs.

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_tgdef text;
  v_fk    text;
BEGIN
  SELECT pg_get_triggerdef(t.oid)
    INTO v_tgdef
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'entity_documents'
    AND t.tgname = 'entity_documents_audit'
    AND NOT t.tgisinternal;

  IF v_tgdef IS NULL THEN
    RAISE EXCEPTION
      'entity_documents_audit trigger is missing on public.entity_documents';
  END IF;

  IF v_tgdef !~* 'AFTER' OR v_tgdef !~* 'INSERT' OR v_tgdef !~* 'UPDATE'
     OR v_tgdef !~* 'DELETE' THEN
    RAISE EXCEPTION
      'entity_documents_audit is not AFTER INSERT OR UPDATE OR DELETE: %',
      v_tgdef;
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO v_fk
  FROM pg_constraint
  WHERE conname = 'document_audit_log_document_id_fkey';

  IF v_fk IS NULL THEN
    RAISE EXCEPTION 'document_audit_log_document_id_fkey is missing';
  END IF;

  IF v_fk !~* 'ON DELETE SET NULL' THEN
    RAISE EXCEPTION
      'document_audit_log_document_id_fkey is not ON DELETE SET NULL: %',
      v_fk;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.entity_documents_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action  text;
  v_old     text;
  v_new     text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_action := 'created';
    v_old    := NULL;
    v_new    := NEW.status;
    INSERT INTO public.document_audit_log
      (document_id, organization_id, entity_type, entity_id,
       action, actor_id, old_status, new_status)
    VALUES
      (NEW.id, NEW.organization_id, NEW.entity_type, NEW.entity_id,
       v_action, NEW.created_by, v_old, v_new);
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE NEW.status
        WHEN 'verified' THEN 'verified'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'replaced' THEN 'replaced'
        ELSE 'updated'
      END;
    ELSE
      v_action := 'updated';
    END IF;

    INSERT INTO public.document_audit_log
      (document_id, organization_id, entity_type, entity_id,
       action, actor_id, old_status, new_status,
       notes, metadata)
    VALUES
      (NEW.id, NEW.organization_id, NEW.entity_type, NEW.entity_id,
       v_action, auth.uid(), OLD.status, NEW.status,
       NEW.notes,
       jsonb_build_object(
         'doc_type',     NEW.doc_type,
         'expiry_date',  NEW.expiry_date,
         'storage_path', NEW.storage_path
       ));
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.document_audit_log
      (document_id, organization_id, entity_type, entity_id,
       action, actor_id, old_status, new_status, metadata)
    VALUES
      (NULL, OLD.organization_id, OLD.entity_type, OLD.entity_id,
       'deleted', auth.uid(), OLD.status, NULL,
       jsonb_build_object(
         'document_id',  OLD.id,
         'doc_type',     OLD.doc_type,
         'storage_path', OLD.storage_path
       ));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
