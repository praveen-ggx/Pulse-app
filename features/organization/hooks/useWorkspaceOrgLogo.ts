import { useOrganization } from "@/contexts/OrganizationContext";
import { updateOrganizationLogo } from "@/features/organization/services/organization.service";
import { syncBrandingFromOrg } from "@/features/invoicing/services/invoiceBranding.service";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { getSignedAvatarUrl, pickAndUploadOrgLogo } from "@/lib/avatarUpload";
import { showAppAlert } from "@/lib/appAlert";
import { useCallback, useEffect, useState } from "react";

/** Workspace org logo — signed URL resolution + upload (same flow as Workspace Settings). */
export function useWorkspaceOrgLogo() {
  const { currentOrganization, refreshOrganization } = useOrganization();
  const { canEdit } = useOrgRole();
  const orgId = currentOrganization?.id ?? null;
  const orgName = currentOrganization?.name?.trim() ?? "";

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const raw = currentOrganization?.logo_url?.trim();
    if (!raw) {
      setLogoUri(null);
      return;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      setLogoUri(raw);
      return;
    }
    void getSignedAvatarUrl(raw).then((signed) => {
      if (mounted) setLogoUri(signed ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const uploadLogo = useCallback(async () => {
    if (!orgId || uploading || !canEdit) return;
    setUploading(true);
    try {
      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        showAppAlert("Upload failed", result.error.message);
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        showAppAlert("Save failed", error.message);
        return;
      }
      if (result.previewUri) setLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, result.path);
    } finally {
      setUploading(false);
    }
  }, [canEdit, orgId, orgName, refreshOrganization, uploading]);

  const alertReadonly = useCallback(() => {
    showAppAlert(
      "Workspace logo",
      "Only workspace owners and admins can update the organisation logo.",
    );
  }, []);

  const onLogoPress = useCallback(() => {
    if (!canEdit) {
      alertReadonly();
      return;
    }
    void uploadLogo();
  }, [alertReadonly, canEdit, uploadLogo]);

  return {
    orgId,
    orgName,
    logoUri,
    logoStoragePath: currentOrganization?.logo_url ?? null,
    uploading,
    canEdit,
    onLogoPress,
  };
}
