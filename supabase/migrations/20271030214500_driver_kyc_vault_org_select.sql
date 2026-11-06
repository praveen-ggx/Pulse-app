SET LOCAL lock_timeout = '5s';

-- Compliance / trip vault need the same License + Aadhaar files the driver app
-- stores on driver_kyc_documents. SELECT was owner-or-platform-reviewer only, so
-- assigned-driver uploads never appeared in org vaults.

DROP POLICY IF EXISTS driver_kyc_documents_org_vault_select ON public.driver_kyc_documents;
CREATE POLICY driver_kyc_documents_org_vault_select ON public.driver_kyc_documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND doc_type IN ('license', 'aadhaar')
    AND (
      EXISTS (
        SELECT 1
        FROM public.drivers d
        JOIN public.organization_members om
          ON om.organization_id = d.organization_id
         AND om.user_id = (SELECT auth.uid())
         AND om.status = 'active'
        WHERE d.user_id = driver_kyc_documents.driver_user_id
          AND d.user_id IS NOT NULL
          AND d.left_at IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.trips t
        JOIN public.drivers d ON d.id = t.driver_id
        JOIN public.organization_members om
          ON om.organization_id = t.organization_id
         AND om.user_id = (SELECT auth.uid())
         AND om.status = 'active'
        WHERE d.user_id = driver_kyc_documents.driver_user_id
          AND d.user_id IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "Trip org members can read assigned driver KYC files" ON storage.objects;
CREATE POLICY "Trip org members can read assigned driver KYC files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    JOIN public.organization_members om
      ON om.organization_id = t.organization_id
     AND om.user_id = (SELECT auth.uid())
     AND om.status = 'active'
    WHERE d.user_id::text = (storage.foldername(name))[1]
      AND d.user_id IS NOT NULL
  )
);
