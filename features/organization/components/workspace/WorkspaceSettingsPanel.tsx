/**
 * Workspace Settings — hub-aligned detail pane (matches WorkspaceHubMenu density).
 *
 *   Card 1: Workspace logo + Upload New / Remove
 *   Card 2: General Details (workspace name, operating model)
 *   Card 3: Invoice Branding preview
 *   Sticky footer: Cancel + Save Changes
 *
 * Business verification lives on Organization, not here.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  changeOperatingModel,
  getGroundOpsDocUploadEnabled,
  looksLikeModelChangeCooldownError,
  setGroundOpsDocUploadEnabled,
  type OperatingModel,
  updateOrganizationLogo,
  updateOrganizationName,
} from "@/features/organization/services/organization.service";
import { ChangeOperatingModelModal } from "@/features/organization/components/workspace/ChangeOperatingModelModal";
import {
  getDocumentChargeConfig,
  saveDocumentChargeConfig,
} from "@/features/organization/services/documentCharges.service";
import { DocumentChargeSlabsModal } from "@/features/organization/components/workspace/DocumentChargeSlabsModal";
import {
  defaultDocumentChargeSlabs,
  formatSlabRange,
  type DocumentChargeSlab,
} from "@/features/organization/utils/documentChargeSlabs.util";
import { useQueryClient } from "@tanstack/react-query";
import { syncBrandingFromOrg } from "@/features/invoicing/services/invoiceBranding.service";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { useWorkspaceFeedback } from "@/features/organization/components/workspace/WorkspaceFeedbackProvider";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  modelLabel,
  orgInitials,
  PURPLE,
  PURPLE_BORDER,
  PURPLE_TINT,
  SectionHeader,
  workspacePanelStyles as styles,
} from "@/features/organization/components/workspace/workspacePanelUi";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useMemberAccess } from "@/lib/useMemberAccess";
import {
  getSignedAvatarUrl,
  pickAndUploadOrgLogo,
} from "@/lib/avatarUpload";
import {
  Camera,
  Lock,
  Trash2,
  UploadCloud,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  onBack: () => void;
};

export function WorkspaceSettingsPanel({ onBack }: Props) {
  const { currentOrganization, refreshOrganization } = useOrganization();
  const { canEdit, isOwner } = useOrgRole();
  const { can } = useMemberAccess();
  const canBranding = can("finance.branding");
  const canDocCharges = canEdit || can("finance.manage");
  const { notice, confirm } = useWorkspaceFeedback();
  const queryClient = useQueryClient();

  const orgId = currentOrganization?.id ?? "";
  const storedName = currentOrganization?.name ?? "";

  const [orgName, setOrgName] = useState(storedName);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [groundOpsEnabled, setGroundOpsEnabled] = useState(false);
  const [groundOpsLoading, setGroundOpsLoading] = useState(false);
  const [docChargesEnabled, setDocChargesEnabled] = useState(false);
  const [docChargeSlabs, setDocChargeSlabs] = useState<DocumentChargeSlab[]>([]);
  const [docChargesLoaded, setDocChargesLoaded] = useState(false);
  const [docChargesSaving, setDocChargesSaving] = useState(false);
  const [slabModalOpen, setSlabModalOpen] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  const currentModel = (currentOrganization?.operatingModel ??
    "HYBRID") as OperatingModel;

  useEffect(() => {
    if (!orgId) return;
    getGroundOpsDocUploadEnabled(orgId).then(setGroundOpsEnabled);
  }, [orgId]);

  const handleChangeModel = async (newModel: OperatingModel) => {
    if (!orgId || modelSaving) return;
    setModelSaving(true);
    try {
      const { error } = await changeOperatingModel(orgId, newModel);
      if (error) {
        // Close first so the banner isn't hidden behind the RN Modal overlay.
        setModelModalOpen(false);
        notice({
          kind: "error",
          title: "Couldn't change model",
          message: looksLikeModelChangeCooldownError(error.message)
            ? "You can change the operating model again 30 days after your last change."
            : error.message,
        });
        return;
      }
      // Propagate: reload org row so useCapabilities recomputes, then purge
      // org-scoped entity caches (same-org model change won't trigger the
      // org-switch purge in OrganizationContext).
      await refreshOrganization();
      queryClient.removeQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "q",
      });
      setModelModalOpen(false);
      notice({
        kind: "success",
        title: "Operating model updated",
        message: "Your workspace tools have been updated.",
      });
    } finally {
      setModelSaving(false);
    }
  };

  const handleToggleGroundOps = async () => {
    if (!orgId || groundOpsLoading || !canEdit) return;
    setGroundOpsLoading(true);
    try {
      const { error } = await setGroundOpsDocUploadEnabled(orgId, !groundOpsEnabled);
      if (error) {
        notice({
          kind: "error",
          title: "Failed to update setting",
          message: error.message,
        });
        return;
      }
      setGroundOpsEnabled(!groundOpsEnabled);
      notice({
        kind: "success",
        title: "Ground Ops setting updated",
        message: groundOpsEnabled
          ? "Ground Ops members can no longer upload trip documents."
          : "Ground Ops members can now upload trip documents.",
      });
    } finally {
      setGroundOpsLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    let mounted = true;
    setDocChargesLoaded(false);
    getDocumentChargeConfig(orgId).then(({ data }) => {
      if (!mounted) return;
      setDocChargesEnabled(data?.enabled ?? false);
      setDocChargeSlabs(data?.slabs ?? []);
      setDocChargesLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, [orgId]);

  const persistDocCharges = async (
    enabled: boolean,
    slabs: DocumentChargeSlab[],
  ): Promise<boolean> => {
    if (!orgId) return false;
    setDocChargesSaving(true);
    try {
      const { error } = await saveDocumentChargeConfig(orgId, { enabled, slabs });
      if (error) {
        notice({
          kind: "error",
          title: "Couldn't save document charges",
          message: error.message,
        });
        return false;
      }
      setDocChargesEnabled(enabled);
      setDocChargeSlabs(slabs);
      return true;
    } finally {
      setDocChargesSaving(false);
    }
  };

  const handleToggleDocCharges = async (next: boolean) => {
    if (!canDocCharges || docChargesSaving || !docChargesLoaded) return;
    const slabs =
      next && docChargeSlabs.length === 0 ? defaultDocumentChargeSlabs() : docChargeSlabs;
    const ok = await persistDocCharges(next, slabs);
    if (ok) {
      notice({
        kind: "success",
        title: next ? "Document charges turned on" : "Document charges turned off",
      });
    }
  };

  const handleSaveSlabs = async (slabs: DocumentChargeSlab[]) => {
    const ok = await persistDocCharges(docChargesEnabled, slabs);
    if (!ok) return;
    setSlabModalOpen(false);
    notice({ kind: "success", title: "Document charge slabs saved" });
  };

  useEffect(() => {
    if (storedName) setOrgName(storedName);
  }, [storedName]);

  useEffect(() => {
    let mounted = true;
    const raw = currentOrganization?.logo_url?.trim();
    if (!raw) {
      setLogoUri(null);
      return;
    }
    if (raw.startsWith("http")) {
      setLogoUri(raw);
      return;
    }
    getSignedAvatarUrl(raw).then((signed) => {
      if (mounted) setLogoUri(signed ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [currentOrganization?.logo_url]);

  const handleUploadLogo = async () => {
    if (!orgId || logoUploading || !canEdit) return;
    setLogoUploading(true);
    try {
      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        notice({
          kind: "error",
          title: "Upload failed",
          message: result.error.message,
        });
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        notice({ kind: "error", title: "Save failed", message: error.message });
        return;
      }
      if (result.previewUri) setLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, result.path);
      notice({ kind: "success", title: "Workspace logo updated" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!orgId || logoUploading || !canEdit) return;
    const ok = await confirm({
      title: "Remove logo?",
      message:
        "Your workspace will fall back to its initials until you upload a new logo.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setLogoUploading(true);
    try {
      const { error } = await updateOrganizationLogo(orgId, null);
      if (error) {
        notice({
          kind: "error",
          title: "Remove failed",
          message: error.message,
        });
        return;
      }
      setLogoUri(null);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, null);
      notice({ kind: "success", title: "Logo removed" });
    } finally {
      setLogoUploading(false);
    }
  };

  const isDirty = orgName.trim() !== storedName.trim() && orgName.trim().length > 0;

  const handleSaveName = async () => {
    if (!orgId || nameSaving || !isDirty) return;
    const trimmed = orgName.trim();
    if (!trimmed) {
      notice({
        kind: "error",
        title: "Invalid name",
        message: "Organisation name cannot be empty.",
      });
      return;
    }
    setNameSaving(true);
    try {
      const { error } = await updateOrganizationName(orgId, trimmed);
      if (error) {
        notice({ kind: "error", title: "Save failed", message: error.message });
        return;
      }
      await refreshOrganization();
      await syncBrandingFromOrg(
        orgId,
        trimmed,
        currentOrganization?.logo_url ?? null,
      );
      notice({ kind: "success", title: "Workspace settings saved" });
    } finally {
      setNameSaving(false);
    }
  };

  const previewName = orgName.trim() || storedName || "YOUR ORG";

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.settings}
      subtitle="How this organization operates Pulse"
      onBack={onBack}
      footerSlot={
        canEdit ? (
          <View style={local.footerActions}>
            <Pressable
              onPress={() => {
                setOrgName(storedName);
                onBack();
              }}
              style={({ pressed }) => [
                local.cancelBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Discard changes"
            >
              <Text style={local.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSaveName()}
              disabled={!isDirty || nameSaving}
              style={({ pressed }) => [
                local.saveBtn,
                (!isDirty || nameSaving) && local.saveBtnDisabled,
                pressed && isDirty && !nameSaving && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save workspace settings"
            >
              {nameSaving ? (
                <LoadingIndicator size="small" color="#fff" />
              ) : (
                <Text style={local.saveText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        ) : undefined
      }
    >
      <View style={styles.panelStack}>
        <View style={[styles.detailCard, local.logoCard]}>
          <View style={local.logoRow}>
            <View style={local.uploadThumbWrap}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={local.uploadThumb} />
              ) : (
                <View style={local.uploadThumbFallback}>
                  <Text style={local.uploadThumbInitials}>
                    {orgInitials(previewName)}
                  </Text>
                </View>
              )}
              <View style={local.uploadThumbBadge}>
                <Camera size={10} color={Theme.textOnDark} strokeWidth={2.4} />
              </View>
            </View>
            <View style={local.uploadInfo}>
              <Text style={local.uploadTitle}>Workspace Logo</Text>
              <Text style={local.uploadSub}>
                PNG or JPG up to 5 MB. Recommended size 256 × 256 px.
              </Text>
              {canEdit ? (
                <View style={local.uploadActions}>
                  <Pressable
                    onPress={() => void handleUploadLogo()}
                    disabled={logoUploading}
                    style={({ pressed }) => [
                      local.uploadBtn,
                      logoUploading && { opacity: 0.6 },
                      pressed && !logoUploading && { opacity: 0.9 },
                    ]}
                  >
                    {logoUploading ? (
                      <LoadingIndicator size="small" color={PURPLE} />
                    ) : (
                      <>
                        <UploadCloud size={11} color={PURPLE} strokeWidth={2.2} />
                        <Text style={local.uploadBtnText}>Upload New</Text>
                      </>
                    )}
                  </Pressable>
                  {logoUri ? (
                    <Pressable
                      onPress={() => void handleRemoveLogo()}
                      disabled={logoUploading}
                      style={({ pressed }) => [
                        local.removeBtn,
                        logoUploading && { opacity: 0.5 },
                        pressed && !logoUploading && { opacity: 0.85 },
                      ]}
                    >
                      <Trash2 size={11} color={Theme.textMuted} strokeWidth={2.2} />
                      <Text style={local.removeBtnText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.kycReadonlyNote, local.readonlyNote]}>
                  <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
                  <Text style={styles.kycReadonlyText}>
                    Only admins and owners can change the workspace logo.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.detailCard}>
          <SectionHeader label="General Details" />

          <View style={[styles.panelFieldGroup, styles.panelFieldGroupFirst]}>
            <Text style={styles.panelFieldLabel}>Workspace Name</Text>
            <TextInput
              ref={nameInputRef}
              style={[
                styles.panelFieldInput,
                !canEdit && styles.panelFieldInputReadonly,
              ]}
              value={orgName}
              onChangeText={canEdit ? setOrgName : undefined}
              placeholder="e.g. GoGoX Logistics"
              placeholderTextColor={Theme.textMuted}
              maxLength={64}
              editable={canEdit}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (isDirty) void handleSaveName();
              }}
            />
          </View>

          <View style={styles.panelFieldGroup}>
            <Text style={styles.panelFieldLabel}>Operating Model</Text>
            {isOwner ? (
              <Pressable
                onPress={() => setModelModalOpen(true)}
                style={({ pressed }) => [
                  styles.panelFieldInput,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.panelFieldStatic}>
                  {modelLabel(currentOrganization?.operatingModel)}
                </Text>
                <Text style={styles.panelFieldHint}>Tap to change</Text>
              </Pressable>
            ) : (
              <View style={[styles.panelFieldInput, styles.panelFieldInputReadonly]}>
                <Text style={styles.panelFieldStatic}>
                  {modelLabel(currentOrganization?.operatingModel)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.panelFieldGroup}>
            <View style={local.toggleRow}>
              <View style={local.toggleLabel}>
                <Text style={styles.panelFieldLabel}>Ground Ops Document Upload</Text>
                <Text style={local.toggleHint}>
                  Allow Ground Ops members to upload trip documents such as LR, POD and manifest on behalf of drivers.
                </Text>
              </View>
              <Switch
                value={groundOpsEnabled}
                onValueChange={() => void handleToggleGroundOps()}
                disabled={!canEdit || groundOpsLoading}
                style={local.switchControl}
              />
            </View>
          </View>
        </View>

        <View style={styles.detailCard}>
          <SectionHeader label="Document Charges" />
          <View style={[styles.panelFieldGroup, styles.panelFieldGroupFirst]}>
            <View style={[local.toggleRow, local.toggleRowFirst]}>
              <View style={local.toggleLabel}>
                <Text style={styles.panelFieldLabel}>Charge Document Fee on Trips</Text>
                <Text style={local.toggleHint}>
                  Apply a flat document charge based on the trip freight cost slab.
                </Text>
              </View>
              <Switch
                value={docChargesEnabled}
                onValueChange={(v) => void handleToggleDocCharges(v)}
                disabled={!canDocCharges || docChargesSaving || !docChargesLoaded}
                style={local.switchControl}
              />
            </View>
            {!canDocCharges ? (
              <View style={[styles.kycReadonlyNote, local.readonlyNote]}>
                <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
                <Text style={styles.kycReadonlyText}>
                  Only owners and finance managers can change document charges.
                </Text>
              </View>
            ) : null}
            {docChargesEnabled ? (
              <View style={local.slabTable}>
                <View style={local.slabHeadRow}>
                  <Text style={[local.slabHead, local.slabRangeCol]}>Freight Cost (₹)</Text>
                  <Text style={[local.slabHead, local.slabChargeCol]}>Charge (₹)</Text>
                </View>
                {docChargeSlabs.map((s) => (
                  <View key={s.id} style={local.slabRow}>
                    <Text style={[local.slabCell, local.slabRangeCol]}>{formatSlabRange(s)}</Text>
                    <Text style={[local.slabCell, local.slabChargeCol]}>
                      {s.charge.toLocaleString("en-IN")}
                    </Text>
                  </View>
                ))}
                {canDocCharges ? (
                  <Pressable
                    onPress={() => setSlabModalOpen(true)}
                    style={({ pressed }) => [local.uploadBtn, local.slabEditBtn, pressed && { opacity: 0.9 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Configure document charge slabs"
                  >
                    <Text style={local.uploadBtnText}>Configure Slabs</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {canBranding ? (
          <View style={styles.detailCard}>
            <SectionHeader label="Invoice Branding" />
            <View style={styles.previewPaper}>
              <Text style={styles.previewWatermark}>{previewName}</Text>
              <View style={styles.previewLogoRow}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.previewLogo} />
                ) : (
                  <View style={styles.previewLogoFallback}>
                    <Text style={styles.previewLogoInitials}>
                      {orgInitials(previewName)}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.previewCompanyName}>
                    {previewName.toUpperCase()}
                  </Text>
                  <Text style={styles.previewDocType}>Commercial Invoice</Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {canDocCharges ? (
        <DocumentChargeSlabsModal
          visible={slabModalOpen}
          slabs={docChargeSlabs}
          saving={docChargesSaving}
          onSave={(slabs) => void handleSaveSlabs(slabs)}
          onClose={() => {
            if (!docChargesSaving) setSlabModalOpen(false);
          }}
        />
      ) : null}
      {isOwner && orgId ? (
        <ChangeOperatingModelModal
          visible={modelModalOpen}
          orgId={orgId}
          currentModel={currentModel}
          saving={modelSaving}
          onConfirm={handleChangeModel}
          onClose={() => {
            if (!modelSaving) setModelModalOpen(false);
          }}
        />
      ) : null}
    </WorkspaceDetailLayout>
  );
}

const local = StyleSheet.create({
  logoCard: { padding: 14 },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  uploadThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    flexShrink: 0,
  },
  uploadThumb: { width: "100%", height: "100%" },
  uploadThumbFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PURPLE_TINT,
  },
  uploadThumbInitials: { fontSize: 16, fontWeight: "800", color: PURPLE },
  uploadThumbBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  uploadInfo: { flex: 1, minWidth: 0, gap: 3 },
  uploadTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
  },
  uploadSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  uploadActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: PURPLE_TINT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PURPLE_BORDER,
  },
  uploadBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: PURPLE,
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  removeBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  readonlyNote: {
    marginHorizontal: 0,
    marginTop: 8,
    marginBottom: 0,
    alignSelf: "stretch",
  },

  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  saveBtn: {
    flex: 1.4,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#c8cdd8",
  },
  saveText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  toggleLabel: {
    flex: 1,
    marginRight: 12,
  },
  toggleHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
    marginTop: 4,
  },
  switchControl: {
    flexShrink: 0,
  },
  toggleRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  slabTable: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
  },
  slabHeadRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Theme.surface,
  },
  slabHead: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  slabRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  slabCell: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  slabRangeCol: { flex: 1 },
  slabChargeCol: { width: 80, textAlign: "right" },
  slabEditBtn: {
    justifyContent: "center",
    margin: 10,
    minHeight: 36,
  },
});
