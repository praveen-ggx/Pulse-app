-- Supabase default privileges grant EXECUTE to anon on new public functions;
-- REVOKE FROM PUBLIC in 20260930165033 doesn't remove that. Authenticated only.
REVOKE EXECUTE ON FUNCTION public.can_manage_org_document_charges(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_org_document_charge_config(uuid, boolean, jsonb) FROM anon;
