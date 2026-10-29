-- entity_documents INSERT audits omitted doc_type / storage_path metadata.
-- Activity then skipped those bare "created" rows; after delete only
-- "deleted RC" remained. Mirror DELETE/UPDATE metadata on INSERT so
-- create events stay durable and labeled.
SET LOCAL lock_timeout = '5s';

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
       action, actor_id, old_status, new_status, notes, metadata)
    VALUES
      (NEW.id, NEW.organization_id, NEW.entity_type, NEW.entity_id,
       v_action, NEW.created_by, v_old, v_new,
       NEW.notes,
       jsonb_build_object(
         'doc_type',     NEW.doc_type,
         'expiry_date',  NEW.expiry_date,
         'storage_path', NEW.storage_path,
         'file_name',    COALESCE(
           NULLIF(BTRIM(NEW.notes), ''),
           NULLIF(substring(NEW.storage_path from '[^/]+$'), '')
         )
       ));
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
         'storage_path', OLD.storage_path,
         'file_name',    COALESCE(
           NULLIF(BTRIM(OLD.notes), ''),
           NULLIF(substring(OLD.storage_path from '[^/]+$'), '')
         )
       ));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
