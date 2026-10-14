/**
 * Domain accordion with drill-down surface toggles (full RBAC catalog).
 * Surfaces unavailable for the org operating model render locked/off.
 * Wide layouts use a 2-column action grid to cut vertical scroll.
 */
import {
  applySurfaceToggle,
  MEMBER_DEPARTMENT_SURFACES,
  MEMBER_SECTION_SURFACES,
  memberHasSurface,
  orgAllowsSurface,
  sectionMasterOn,
  surfaceGroupsForIds,
  type MemberSectionKey,
  type MemberSurfaceDef,
  type MemberSurfaceId,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";
import type { Capability } from "@/lib/capabilities";
import type { FunctionalRole } from "@/features/organization/utils/teamInviteRoles.util";
import { Check, ChevronDown, ChevronUp, Lock, Minus } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

/** Tri-state checkbox used for both group headers and individual surfaces. */
function SurfaceCheckbox({
  state,
  accent,
  disabled,
  label,
  onPress,
}: {
  state: "on" | "off" | "mixed";
  accent: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const filled = state !== "off";
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === "mixed" ? "mixed" : state === "on", disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.checkbox,
        filled && { backgroundColor: accent, borderColor: accent },
        disabled && styles.checkboxDisabled,
        pressed && !disabled && { opacity: 0.7 },
      ]}
    >
      {state === "on" ? (
        <Check size={12} color="#FFFFFF" strokeWidth={3} />
      ) : state === "mixed" ? (
        <Minus size={12} color="#FFFFFF" strokeWidth={3} />
      ) : null}
    </Pressable>
  );
}

const DOMAIN_ACCENT: Record<FunctionalRole | MemberSectionKey, string> = {
  finance: "#0894FF",
  sales: "#C959DD",
  tripops: "#FF9004",
  supply: "#00A6A6",
  compliance: "#E5484D",
  debit_control: "#B45309",
  vendor_support: "#7C5CFF",
  it: "#525252",
};

export type DomainToggleRowKey = FunctionalRole | MemberSectionKey;

export type DomainToggleRowDef = {
  key: DomainToggleRowKey;
  label: string;
  hint: string;
};

/** Section rows are presentational views over existing surfaces. */
function isSectionKey(key: DomainToggleRowKey): key is MemberSectionKey {
  return key in MEMBER_SECTION_SURFACES;
}

type Props = {
  def: DomainToggleRowDef;
  /** Domain master switch (tab-level). */
  domainEnabled: boolean;
  surfaces: MemberSurfaceMap;
  orgCaps: Capability[];
  canEdit: boolean;
  orgAllowsDomain: boolean;
  /** Start expanded (default: false — less scroll on first paint). */
  defaultExpanded?: boolean;
  onToggleDomain: (next: boolean) => void;
  onToggleSurface: (id: MemberSurfaceId, next: boolean) => void;
};

export function DomainPermissionToggleRow({
  def,
  domainEnabled,
  surfaces,
  orgCaps,
  canEdit,
  orgAllowsDomain,
  defaultExpanded = false,
  onToggleDomain,
  onToggleSurface,
}: Props) {
  const { width } = useWindowDimensions();
  const twoColSurfaces = width >= 720;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accent = DOMAIN_ACCENT[def.key];
  const lockedByOrg = !orgAllowsDomain;
  const switchOn = domainEnabled && orgAllowsDomain;
  const isSection = isSectionKey(def.key);
  /**
   * A section's own switch is a bulk shortcut, not a gate — its checkboxes stay
   * editable regardless, so flipping the section off doesn't lock you out of
   * turning individual rows back on. Domain rows do gate on their master switch.
   */
  const surfacesEditable = canEdit && (isSection || switchOn);

  // Each department lists only the surfaces it owns — no toggle repeats.
  const groups = useMemo(
    () => surfaceGroupsForIds(MEMBER_DEPARTMENT_SURFACES[def.key]),
    [def.key],
  );
  const rows = useMemo(() => groups.flatMap((g) => g.surfaces), [groups]);

  const enabledCount = rows.filter((r) =>
    memberHasSurface(orgCaps, surfaces, r.id, false),
  ).length;
  const availableCount = rows.filter((r) => orgAllowsSurface(orgCaps, r.id)).length;
  /**
   * Compliance follows the Compliance preset (docs + verify), not "every row",
   * so resubmit can stay off while the switch stays on.
   * Other sections still require every org-allowed row.
   */
  const sectionOn = isSectionKey(def.key)
    ? sectionMasterOn(def.key, surfaces, orgCaps)
    : false;

  /**
   * Bulk-apply a group header checkbox across its org-allowed surfaces.
   * Applies to every member unconditionally — the parent cascade can flip
   * siblings mid-loop, so skipping based on render-time state would miss rows.
   * When switching off, deepest-first so a parent's cascade can't re-disable a
   * child we already handled.
   */
  const toggleGroup = (members: MemberSurfaceDef[], next: boolean) => {
    const ordered = next ? members : [...members].reverse();
    for (const surface of ordered) {
      onToggleSurface(surface.id, next);
    }
  };

  return (
    <View
      style={[
        styles.card,
        (isSection ? enabledCount > 0 : switchOn) && styles.cardOn,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.copy}>
          <Text style={styles.label}>{def.label}</Text>
          <Text style={styles.hint} numberOfLines={1}>
            {lockedByOrg && !isSection
              ? "Not available for this workspace operating model"
              : def.hint}
          </Text>
        </View>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [
            styles.expandChip,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={styles.expandText}>
            {expanded ? "Hide" : "Show"} {availableCount}
            {availableCount > 0 ? ` · ${enabledCount} on` : ""}
          </Text>
          {expanded ? (
            <ChevronUp size={14} color="#737373" strokeWidth={2} />
          ) : (
            <ChevronDown size={14} color="#737373" strokeWidth={2} />
          )}
        </Pressable>
        <Switch
          value={isSection ? sectionOn : switchOn}
          disabled={!canEdit || (isSection ? availableCount === 0 : lockedByOrg)}
          onValueChange={onToggleDomain}
          trackColor={{ false: "#E8E8E8", true: accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#E8E8E8"
          accessibilityLabel={`${def.label} ${isSection ? "section" : "domain"}`}
        />
      </View>

      {expanded ? (
        <View style={styles.groupStack}>
          {groups.map((group) => {
            const available = group.surfaces.filter((s) =>
              orgAllowsSurface(orgCaps, s.id),
            );
            if (available.length === 0) return null;
            const onCount = available.filter((s) =>
              memberHasSurface(orgCaps, surfaces, s.id, false),
            ).length;
            const groupState =
              onCount === 0 ? "off" : onCount === available.length ? "on" : "mixed";
            return (
              <View
                key={group.group ?? "__basics"}
                style={styles.groupBlock}
              >
                {group.group ? (
                  <View style={styles.groupHead}>
                    <SurfaceCheckbox
                      state={groupState}
                      accent={accent}
                      disabled={!surfacesEditable}
                      label={`${group.group} — all`}
                      onPress={() => toggleGroup(available, groupState !== "on")}
                    />
                    <Text style={styles.groupTitle}>{group.group}</Text>
                    <Text style={styles.groupCount}>
                      {onCount}/{available.length}
                    </Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.surfaceList,
                    twoColSurfaces && styles.surfaceListGrid,
                    group.group ? styles.surfaceListIndent : null,
                  ]}
                >
                  {group.surfaces.map((surface) => {
                    const orgOk = orgAllowsSurface(orgCaps, surface.id);
                    const on = memberHasSurface(
                      orgCaps,
                      surfaces,
                      surface.id,
                      false,
                    );
                    return (
                      <View
                        key={surface.id}
                        style={[
                          styles.surfaceRow,
                          twoColSurfaces
                            ? styles.surfaceRowHalf
                            : styles.surfaceRowFull,
                          !orgOk && styles.surfaceRowMuted,
                        ]}
                      >
                        {!orgOk ? (
                          <Lock size={14} color="#A3A3A3" strokeWidth={2} />
                        ) : (
                          <SurfaceCheckbox
                            state={on ? "on" : "off"}
                            accent={accent}
                            disabled={!surfacesEditable}
                            label={surface.label}
                            onPress={() => onToggleSurface(surface.id, !on)}
                          />
                        )}
                        <View style={styles.surfaceCopy}>
                          <Text
                            style={[
                              styles.surfaceLabel,
                              !orgOk && styles.surfaceMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {surface.label}
                          </Text>
                          <Text style={styles.surfaceHint} numberOfLines={1}>
                            {!orgOk ? "Blocked by operating model" : surface.hint}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export const DOMAIN_TOGGLE_ROWS: DomainToggleRowDef[] = [
  {
    key: "finance",
    label: "Finance",
    hint: "Fiscal tab, ledgers, invoicing, reconciliation, reports",
  },
  {
    key: "sales",
    label: "Sales / Network",
    hint: "Network, clients, marketplace, indents, Pulse loads",
  },
  {
    key: "tripops",
    label: "Operations",
    hint: "Trips, tracking, trip docs, vehicles, drivers",
  },
  // Sections: each owns its rows outright (listed nowhere else).
  {
    key: "supply",
    label: "Supply",
    hint: "Indent bidding, award and allocation",
  },
  {
    key: "vendor_support",
    label: "Vendor support",
    hint: "Suppliers (Network + Finance), partner chat, network connect",
  },
  {
    key: "compliance",
    label: "Compliance",
    hint: "Document upload and compliance verification queues",
  },
  {
    key: "debit_control",
    label: "Debit control",
    hint: "Hard-copy POD (POD Pending / POD Received)",
  },
  {
    key: "it",
    label: "IT dept / Workspace",
    hint: "Team access, invites, audit, settings, verification, notifications",
  },
];

/** Re-export helper for parent panel cascade. */
export { applySurfaceToggle };

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FBFBFB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    gap: 0,
  },
  cardOn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4E4E4",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  // L1 — domain / section title. Largest, darkest, tightest.
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A0A0A",
    letterSpacing: -0.4,
  },
  hint: {
    fontSize: 11.5,
    color: "#8A8A8A",
    lineHeight: 15,
    letterSpacing: -0.1,
  },
  expandChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#F3F3F3",
  },
  expandText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#737373",
  },
  groupStack: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
    // Wide gap between groups is the main separator between L2 blocks.
    gap: 18,
  },
  groupBlock: { gap: 6 },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EFEFEF",
  },
  // L2 — group header. Uppercase micro-caps read as a different tier than L1.
  groupTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#404040",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  groupCount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8A8A8A",
    fontVariant: ["tabular-nums"],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "#F4F4F4",
    overflow: "hidden",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#D4D4D4",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDisabled: { opacity: 0.45 },
  surfaceList: {
    gap: 4,
  },
  // Left rule ties every child surface visually to its group header.
  surfaceListIndent: {
    marginLeft: 13,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#F0F0F0",
  },
  surfaceListGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    rowGap: 2,
  },
  surfaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  surfaceRowFull: {
    width: "100%",
  },
  surfaceRowHalf: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "48%",
    maxWidth: "49.5%",
    backgroundColor: "#FAFAFA",
  },
  surfaceRowMuted: {
    opacity: 0.7,
  },
  surfaceCopy: { flex: 1, minWidth: 0, gap: 2 },
  // L3 — the actual grant. Must out-rank its own hint clearly.
  surfaceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F1F1F",
    letterSpacing: -0.2,
  },
  surfaceMuted: { color: "#A3A3A3" },
  // L4 — hint. Deliberately the lightest thing on screen.
  surfaceHint: {
    fontSize: 10.5,
    color: "#ADADAD",
    lineHeight: 14,
  },
});
