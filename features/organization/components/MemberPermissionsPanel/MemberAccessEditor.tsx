/**
 * Member access editor — role presets, Department manager, custom presets and
 * department rows. The one UI for access in both Invite and Edit member, so a
 * role picked on invite looks and saves exactly like the same role on edit.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { confirmDialog } from "@/lib/confirmDialog";
import {
  DOMAIN_TOGGLE_ROWS,
  DomainPermissionToggleRow,
} from "@/features/organization/components/MemberPermissionsPanel/DomainPermissionToggleRow";
import type { MemberAccessDraft } from "@/features/organization/hooks/useMemberAccessDraft";
import { listOrgWarehouses } from "@/features/organization/services/memberWarehouses.service";
import { WarehousePicker } from "@/features/organization/components/MemberPermissionsPanel/WarehousePicker";
import {
  deleteCustomRolePreset,
  getCustomRolePresets,
  getGroundOpsDocUploadEnabled,
  saveCustomRolePreset,
  type CustomRolePreset,
} from "@/features/organization/services/organization.service";
import {
  canBeDepartmentManager,
  platformRoleLabel,
  TEAM_INVITE_ROLE_OPTIONS,
  type FunctionalRole,
} from "@/features/organization/utils/teamInviteRoles.util";
import type { Capability } from "@/lib/capabilities";
import {
  canAccessClients,
  canAccessFinance,
  canAccessIndents,
  canAccessSuppliers,
  canAccessTrips,
} from "@/lib/capabilities";
import {
  MEMBER_SECTION_SURFACES,
  MEMBER_SURFACE_CATALOG,
  defaultSurfacesForRole,
  memberHasSurface,
  type MemberSectionKey,
} from "@/lib/memberSurfaces";
import { useQuery } from "@tanstack/react-query";
import { BookmarkPlus, Check, ChevronDown, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  draft: MemberAccessDraft;
  orgId: string | null;
  orgCaps: Capability[];
  /** Role tiles + department/section master switches. */
  canEditRole: boolean;
  /** Individual action toggles (owner, inviter, or department manager). */
  canEditSurfaces: boolean;
  /** Owner-only: grant the Department manager flag. */
  canAssignManager: boolean;
  busy: boolean;
  /** Lay role tiles out in one row (wide desktop). */
  wide?: boolean;
  onError: (message: string | null) => void;
};

export function MemberAccessEditor({
  draft,
  orgId,
  orgCaps,
  canEditRole,
  canEditSurfaces,
  canAssignManager,
  busy,
  wide = false,
  onError,
}: Props) {
  const [presets, setPresets] = useState<CustomRolePreset[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [groundOpsEnabled, setGroundOpsEnabled] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void (async () => {
      const [{ error: presetErr, presets: loaded }, groundOps] = await Promise.all([
        getCustomRolePresets(orgId),
        getGroundOpsDocUploadEnabled(orgId),
      ]);
      if (cancelled) return;
      if (!presetErr) setPresets(loaded);
      setGroundOpsEnabled(groundOps);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const orgAllows = useMemo<Record<FunctionalRole, boolean>>(
    () => ({
      finance: canAccessFinance(orgCaps),
      sales:
        orgCaps.includes("marketplace_post") ||
        orgCaps.includes("marketplace_bid") ||
        canAccessClients(orgCaps) ||
        // Indents live under Sales; keep it unlocked for give-load orgs that
        // have dispatch but no marketplace/client caps.
        canAccessIndents(orgCaps),
      tripops: canAccessIndents(orgCaps) || canAccessTrips(orgCaps),
    }),
    [orgCaps],
  );

  // Ground Ops needs field doc upload on; Vendor support needs suppliers
  // (not Asset-only). A member who already holds the role still sees it.
  const roleOptions = useMemo(() => {
    const suppliers = canAccessSuppliers(orgCaps);
    return TEAM_INVITE_ROLE_OPTIONS.filter((o) => {
      if (draft.platformRole === o.value) return true;
      if (o.value === "ground_ops") return groundOpsEnabled;
      if (o.value === "vendor_support") return suppliers;
      return true;
    });
  }, [groundOpsEnabled, draft.platformRole, orgCaps]);

  const canManagePresets = canEditSurfaces;

  // Saved access drifts from the role preset when the preset gains surfaces
  // later (e.g. Finance's Compliance-page tabs). Show it and offer a reset.
  const presetDrift = useMemo(() => {
    const role = draft.platformRole;
    if (role === "admin" || role === "restricted" || role === "planner" || role === "operator") {
      return null;
    }
    const preset = defaultSurfacesForRole(role, orgCaps);
    let missing = 0;
    let extra = 0;
    for (const def of MEMBER_SURFACE_CATALOG) {
      const want = memberHasSurface(orgCaps, preset, def.id);
      const has = memberHasSurface(orgCaps, draft.surfaces, def.id);
      if (want && !has) missing += 1;
      else if (!want && has) extra += 1;
    }
    return missing + extra > 0 ? { missing, extra } : null;
  }, [draft.platformRole, draft.surfaces, orgCaps]);
  const isGroundOps = draft.platformRole === "ground_ops";

  const warehousesQuery = useQuery({
    queryKey: ["org-warehouse-options", orgId],
    enabled: isGroundOps && !!orgId,
    // Shared by Invite and Edit; warehouses change rarely.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { error, warehouses } = await listOrgWarehouses(orgId as string);
      if (error) throw error;
      return warehouses;
    },
  });

  const handleSavePreset = useCallback(async () => {
    if (!orgId || !canManagePresets) return;
    const name = presetName.trim();
    if (!name) {
      onError("Give the preset a name before saving it.");
      return;
    }
    setPresetBusy(true);
    onError(null);
    try {
      const { error: saveErr, presets: next } = await saveCustomRolePreset(orgId, {
        name,
        surfaces: draft.surfaces,
        platformRole: draft.platformRole,
      });
      if (saveErr) {
        onError(saveErr.message);
        return;
      }
      setPresets(next);
      setPresetName("");
    } finally {
      setPresetBusy(false);
    }
  }, [orgId, canManagePresets, presetName, draft.surfaces, draft.platformRole, onError]);

  const handleDeletePreset = useCallback(
    (preset: CustomRolePreset) => {
      if (!orgId || !canManagePresets) return;
      void (async () => {
        const confirmed = await confirmDialog({
          title: "Delete preset?",
          message: `Remove "${preset.name}" from this workspace?`,
          confirmLabel: "Delete",
          cancelLabel: "Keep",
          destructive: true,
        });
        if (!confirmed) return;
        setPresetBusy(true);
        try {
          const { error: delErr, presets: next } = await deleteCustomRolePreset(
            orgId,
            preset.id,
          );
          if (delErr) {
            onError(delErr.message);
            return;
          }
          setPresets(next);
        } finally {
          setPresetBusy(false);
        }
      })();
    },
    [orgId, canManagePresets, onError],
  );

  const disabled = busy || presetBusy;

  return (
    <View style={styles.root}>
      <View style={styles.sectionHeadRow}>
        <View style={styles.sectionHeadCopy}>
          <Text style={styles.sectionEyebrow}>Role</Text>
          <Text style={styles.sectionLead} numberOfLines={1}>
            Pick a preset first, then fine-tune actions per department.
          </Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{draft.enabledSurfaceCount} on</Text>
        </View>
      </View>

      <View style={styles.presetGrid}>
        {roleOptions.map((option) => {
          const selected = draft.platformRole === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (!canEditRole) return;
                draft.selectRole(option.value);
                onError(null);
              }}
              disabled={!canEditRole || disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !canEditRole }}
              style={({ pressed }) => [
                styles.presetTile,
                wide && styles.presetTileWide,
                selected && styles.presetTileOn,
                pressed && canEditRole && { opacity: 0.88 },
              ]}
            >
              <View style={styles.presetTop}>
                <Text
                  style={[styles.presetLabel, selected && styles.presetLabelOn]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {selected ? (
                  <View style={styles.checkBubble}>
                    <Check size={12} color="#171717" strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.presetDesc, selected && styles.presetDescOn]}
                numberOfLines={2}
              >
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {presetDrift && canEditRole ? (
        <View style={styles.driftBanner}>
          <View style={styles.sectionHeadCopy}>
            <Text style={styles.driftTitle}>
              Access differs from the {platformRoleLabel(draft.platformRole)} preset
            </Text>
            <Text style={styles.sectionLead}>
              {presetDrift.missing} missing · {presetDrift.extra} extra. Reset to give exactly
              what the role includes today.
            </Text>
          </View>
          <Pressable
            onPress={() => {
              draft.selectRole(draft.platformRole);
              onError(null);
            }}
            disabled={disabled}
            style={({ pressed }) => [styles.driftBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Reset to ${platformRoleLabel(draft.platformRole)} preset`}
          >
            <Text style={styles.driftBtnText}>
              Reset to {platformRoleLabel(draft.platformRole)} preset
            </Text>
          </Pressable>
        </View>
      ) : null}

      {canAssignManager && canBeDepartmentManager(draft.platformRole) ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.sectionHeadCopy}>
              <Text style={styles.sectionEyebrow}>Department manager</Text>
              <Text style={styles.sectionLead} numberOfLines={2}>
                Lets this member edit permission toggles for other{" "}
                {platformRoleLabel(draft.platformRole)} members — not role changes,
                not other departments.
              </Text>
            </View>
            <Switch
              value={draft.isDepartmentManager}
              onValueChange={draft.setIsDepartmentManager}
              disabled={disabled}
              accessibilityLabel="Department manager"
            />
          </View>
        </View>
      ) : null}

      {isGroundOps ? (
        <WarehousePicker
          options={warehousesQuery.data ?? []}
          selectedIds={draft.warehouseIds}
          isLoading={warehousesQuery.isLoading}
          isError={warehousesQuery.isError}
          editable={canEditRole && !disabled}
          onToggle={draft.toggleWarehouse}
        />
      ) : null}

      {canManagePresets ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.sectionHeadCopy}>
              <Text style={styles.sectionEyebrow}>Custom presets</Text>
              <Text style={styles.sectionLead} numberOfLines={2}>
                Save this exact toggle set and re-apply it to other members.
              </Text>
            </View>
            {presets.length > 0 ? (
              <Pressable
                onPress={() => setPresetsOpen((o) => !o)}
                disabled={disabled}
                style={({ pressed }) => [styles.presetApplyBtn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="Apply a saved preset"
              >
                <Text style={styles.presetApplyBtnText}>
                  Apply preset ({presets.length})
                </Text>
                <ChevronDown
                  size={13}
                  color="#171717"
                  strokeWidth={2.4}
                  style={presetsOpen ? styles.chevronOpen : undefined}
                />
              </Pressable>
            ) : null}
          </View>

          {presetsOpen ? (
            <View style={styles.presetList}>
              {presets.map((p) => {
                const on = draft.appliedPresetId === p.id;
                return (
                  <View key={p.id} style={styles.presetListRow}>
                    <Pressable
                      onPress={() => {
                        draft.applyPreset(p);
                        setPresetsOpen(false);
                        onError(null);
                      }}
                      disabled={disabled}
                      style={({ pressed }) => [
                        styles.presetListMain,
                        on && styles.presetListMainOn,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        style={[styles.presetListName, on && styles.presetListNameOn]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <Text
                        style={[styles.presetListMeta, on && styles.presetListMetaOn]}
                        numberOfLines={1}
                      >
                        {Object.values(p.surfaces).filter((v) => v === true).length} surfaces
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeletePreset(p)}
                      disabled={disabled}
                      hitSlop={8}
                      style={({ pressed }) => [styles.presetDeleteBtn, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete preset ${p.name}`}
                    >
                      <Trash2 size={13} color="#FF2E54" strokeWidth={2.2} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.presetSaveRow}>
            <TextInput
              style={styles.presetInput}
              placeholder="Name this preset…"
              placeholderTextColor="#A3A3A3"
              value={presetName}
              onChangeText={setPresetName}
              editable={!disabled}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handleSavePreset()}
            />
            <Pressable
              onPress={() => void handleSavePreset()}
              disabled={disabled || !presetName.trim()}
              style={({ pressed }) => [
                styles.presetSaveBtn,
                pressed && { opacity: 0.88 },
                (disabled || !presetName.trim()) && styles.presetSaveBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save as custom preset"
            >
              {presetBusy ? (
                <LoadingIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <BookmarkPlus size={13} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={styles.presetSaveBtnText}>Save</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.domainHeader}>
        <Text style={styles.sectionEyebrow}>Departments</Text>
        <Text style={styles.domainHint}>Org model ∩ toggles · Owner/Admin bypass</Text>
      </View>
      <View style={styles.domainStack}>
        {DOMAIN_TOGGLE_ROWS.map((def) => {
          const isSection = def.key in MEMBER_SECTION_SURFACES;
          return (
            <DomainPermissionToggleRow
              key={def.key}
              def={def}
              domainEnabled={isSection ? true : draft.domains[def.key as FunctionalRole]}
              surfaces={draft.surfaces}
              orgCaps={orgCaps}
              canEdit={canEditSurfaces && !busy}
              orgAllowsDomain={isSection ? true : orgAllows[def.key as FunctionalRole]}
              defaultExpanded={false}
              onToggleDomain={(next) => {
                // Master switches are a role-level change (owner / inviter only).
                if (!canEditRole) return;
                if (isSection) {
                  draft.toggleSection(def.key as MemberSectionKey, next);
                } else {
                  draft.toggleDomain(def.key as FunctionalRole, next);
                }
                onError(null);
              }}
              onToggleSurface={(id, next) => {
                draft.toggleSurface(id, next);
                onError(null);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, width: "100%" },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeadCopy: { flex: 1, minWidth: 0, gap: 2 },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.2,
  },
  sectionLead: {
    fontSize: 12,
    color: "#737373",
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  countPill: {
    backgroundColor: "#F3F3F3",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#525252",
    letterSpacing: -0.1,
  },

  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  presetTile: {
    width: "48%",
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: "#FBFBFB",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    minHeight: 72,
  },
  presetTileWide: {
    width: "23%",
    minHeight: 68,
  },
  presetTileOn: {
    backgroundColor: "#171717",
    borderColor: "#171717",
  },
  presetTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.3,
    flex: 1,
    minWidth: 0,
  },
  presetLabelOn: { color: "#FFFFFF" },
  presetDesc: {
    fontSize: 11,
    color: "#737373",
    lineHeight: 14,
    letterSpacing: -0.1,
  },
  presetDescOn: { color: "rgba(255,255,255,0.65)" },
  checkBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  driftBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F5D0A9",
  },
  driftTitle: { fontSize: 12, fontWeight: "700", color: "#B45309" },
  driftBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
  },
  driftBtnText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FBFBFB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    gap: 10,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  presetApplyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
  },
  presetApplyBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.2,
  },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  presetList: { gap: 6 },
  presetListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  presetListMain: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
    gap: 1,
  },
  presetListMainOn: {
    backgroundColor: "#171717",
    borderColor: "#171717",
  },
  presetListName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.2,
  },
  presetListNameOn: { color: "#FFFFFF" },
  presetListMeta: {
    fontSize: 10,
    color: "#A3A3A3",
  },
  presetListMetaOn: { color: "rgba(255,255,255,0.6)" },
  presetDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  presetSaveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  presetInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
    fontSize: 13,
    color: "#171717",
  },
  presetSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#171717",
  },
  presetSaveBtnDisabled: { opacity: 0.35 },
  presetSaveBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },

  domainHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
  },
  domainHint: {
    fontSize: 11,
    color: "#A3A3A3",
    letterSpacing: -0.1,
  },
  domainStack: { gap: 12, width: "100%" },
});
