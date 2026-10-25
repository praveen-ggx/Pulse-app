import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import {
  ProvisionRevisedPartiesCard,
  type ProvisionCostBreakdownLine,
  type ProvisionFinanceLayout,
} from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";
import { ProvisionPassThroughCard } from "@/features/trips/components/trip-detail/adjustment/ProvisionPassThroughCard";
import {
  fetchAdjustmentActorNames,
  formatAdjustmentAddedAt,
  resolveAdjustmentAddedBy,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentAddedLog.util";
import {
  selectClientPassThroughRecommendations,
  type ClientPassThroughRecommendation,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";

const LINK = "#2874F0";
const INK = "#212121";
const BODY = "#616161";
const MUTED = "#9E9E9E";
const CANVAS = "#F5F5F5";

export interface TripFinanceAdjustmentsPanelProps {
  adjustments: TripAdjustment[];
  sales: number;
  adjSales: number;
  revenueSideDelta: number;
  cost: number;
  adjCost: number;
  costSideDelta: number;
  clientName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  clientOrganizationImageUrl?: string | null;
  clientOrganizationAvatarSeed?: string | null;
  clientIntegrated?: boolean;
  supplierName: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  supplierOrganizationImageUrl?: string | null;
  supplierOrganizationAvatarSeed?: string | null;
  supplierIntegrated?: boolean;
  /** Asset execution: cost lane is driver labor + posted trip expenses. */
  isAssetExecution?: boolean;
  costLaneLabel?: string;
  costBreakdownLines?: ProvisionCostBreakdownLine[];
  /** True when the supplier/cost rate was never entered on the trip (renders "Not set" instead of a false ₹0). */
  costUnset?: boolean;
  lineMetaLabel: (adj: TripAdjustment) => string;
  /**
   * False hides the +Sale / +Cost toolbar for a viewer without
   * `finance.void_adjustments`. Defaults to true so existing callers are
   * unchanged. The modal itself is separately gated in useTripDetail.
   */
  canAddAdjustment?: boolean;
  onOpenProvision: (side: "client" | "supplier") => void;
  onRequestDeduction?: (rec: ClientPassThroughRecommendation) => void;
  onViewNotePdf?: (adj: TripAdjustment) => void;
  onSelectedAdjustmentChange?: (adj: TripAdjustment | null) => void;
  onEditAdjustment?: (adj: TripAdjustment) => void;
  capturePaymentSlot?: ReactNode;
  /** Pulse Exchange settlement; hidden by the panel when the trip is not enrolled. */
  exchangeSlot?: ReactNode;
  layout?: ProvisionFinanceLayout;
  /** Settlement / Final Settlement: only the CN/DN table (preview + edit). */
  linesOnly?: boolean;
}

function cnDnLabel(impact: TripAdjustment["impact"]): string {
  return impact === "minus" ? "CN" : "DN";
}

/** Fixed widths for compact columns; party and reason share flexible space. */
const COL_NOTE = 48;
const COL_AMT = 88;
const COL_ADDED = 128;

export const TripFinanceAdjustmentsPanel = memo(function TripFinanceAdjustmentsPanel(
  props: TripFinanceAdjustmentsPanelProps,
) {
  const rows = useMemo(
    () =>
      [...(Array.isArray(props.adjustments) ? props.adjustments : [])].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    [props.adjustments],
  );

  const activeCount = rows.filter((a) => !isAdjustmentVoided(a)).length;
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedPartyKey, setSelectedPartyKey] = useState<"client" | "supplier" | null>(null);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const auth = useAuth();
  const currentUserId = auth.user?.uid ?? auth.profile?.uid ?? null;
  const currentUserName =
    auth.profile?.full_name?.trim() ||
    auth.profile?.displayName?.trim() ||
    auth.user?.displayName?.trim() ||
    null;
  const layout = props.layout ?? "mobile";
  const isDesktop = layout === "desktop";
  const colAmt = isDesktop ? 96 : COL_AMT;
  const colAdded = isDesktop ? COL_ADDED : 0;

  useEffect(() => {
    let cancelled = false;
    const ids = rows.map((row) => row.created_by);
    const orgId = rows.find((row) => row.organization_id)?.organization_id ?? null;
    if (!ids.some((id) => String(id ?? "").trim())) {
      setActorNames({});
      return;
    }
    void fetchAdjustmentActorNames(ids, orgId).then((map) => {
      if (!cancelled) setActorNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const passThroughRecommendations = useMemo(
    () =>
      selectClientPassThroughRecommendations({
        adjustments: Array.isArray(props.adjustments) ? props.adjustments : [],
        isAssetExecution: Boolean(props.isAssetExecution),
        driverOrSupplierName: props.supplierName,
      }),
    [props.adjustments, props.isAssetExecution, props.supplierName],
  );

  const partyGroups = useMemo(
    () => [
      {
        key: "client" as const,
        type: "revenue" as const,
        name: props.clientName,
        entityType: "client" as const,
        rows: rows.filter((row) => row.type === "revenue"),
        base: props.sales,
        revised: props.adjSales,
        avatarUrl: props.clientAvatarUrl,
        avatarSeed: props.clientAvatarSeed,
        organizationImageUrl: props.clientOrganizationImageUrl,
        organizationAvatarSeed: props.clientOrganizationAvatarSeed,
        isIntegrated: props.clientIntegrated,
      },
      {
        key: "supplier" as const,
        type: "cost" as const,
        name: props.supplierName,
        entityType: (props.isAssetExecution ? "driver" : "supplier") as "driver" | "supplier",
        rows: rows.filter((row) => row.type === "cost"),
        base: props.cost,
        revised: props.adjCost,
        avatarUrl: props.supplierAvatarUrl,
        avatarSeed: props.supplierAvatarSeed,
        organizationImageUrl: props.supplierOrganizationImageUrl,
        organizationAvatarSeed: props.supplierOrganizationAvatarSeed,
        isIntegrated: props.supplierIntegrated,
      },
    ],
    [
      props.adjCost,
      props.adjSales,
      props.clientAvatarSeed,
      props.clientAvatarUrl,
      props.clientIntegrated,
      props.clientName,
      props.clientOrganizationAvatarSeed,
      props.clientOrganizationImageUrl,
      props.cost,
      props.isAssetExecution,
      props.sales,
      props.supplierAvatarSeed,
      props.supplierAvatarUrl,
      props.supplierIntegrated,
      props.supplierName,
      props.supplierOrganizationAvatarSeed,
      props.supplierOrganizationImageUrl,
      rows,
    ],
  );

  const visibleRows = useMemo(() => {
    if (selectedPartyKey === "client") return rows.filter((row) => row.type === "revenue");
    if (selectedPartyKey === "supplier") return rows.filter((row) => row.type === "cost");
    return rows;
  }, [rows, selectedPartyKey]);

  useEffect(() => {
    if (selectedRowId && !visibleRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(null);
    }
    const selected = visibleRows.find((row) => row.id === selectedRowId) ?? null;
    props.onSelectedAdjustmentChange?.(selected);
  }, [props.onSelectedAdjustmentChange, selectedRowId, visibleRows]);

  const toolbarEl = (
      <View style={[styles.tableToolbar, !isDesktop && styles.tableToolbarMobile]}>
        <View style={styles.partyNameRow}>
          {partyGroups.map((group) => {
            const selected = selectedPartyKey === group.key;
            return (
              <Pressable
                key={group.key}
                style={[styles.partyNameChip, selected && styles.partyNameChipOn]}
                onPress={() =>
                  setSelectedPartyKey((current) => (current === group.key ? null : group.key))
                }
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${selected ? "Show all parties" : `Show ${group.name}`}`}
              >
                <EntityAvatar
                  name={group.name}
                  avatarUrl={group.avatarUrl}
                  avatarSeed={group.avatarSeed}
                  organizationImageUrl={group.organizationImageUrl}
                  organizationAvatarSeed={group.organizationAvatarSeed}
                  isIntegrated={group.isIntegrated}
                  entityType={group.entityType}
                  size={20}
                  showIntegrationBadge={false}
                />
                <Text
                  style={[styles.partyNameChipText, selected && styles.partyNameChipTextOn]}
                  numberOfLines={1}
                >
                  {group.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {props.canAddAdjustment !== false && (
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.addBtnSale, isDesktop && styles.addBtnDesktop]}
            onPress={() => props.onOpenProvision("client")}
          >
            <Feather name="plus" size={isDesktop ? 13 : 12} color={Theme.primary} />
            <Text style={[styles.addBtnSaleText, isDesktop && styles.addBtnTextDesktop]}>
              Sale
            </Text>
          </Pressable>
          <Pressable
            style={[styles.addBtnCost, isDesktop && styles.addBtnDesktop]}
            onPress={() => props.onOpenProvision("supplier")}
          >
            <Feather name="plus" size={isDesktop ? 13 : 12} color={Theme.negative} />
            <Text style={[styles.addBtnCostText, isDesktop && styles.addBtnTextDesktop]}>
              {props.isAssetExecution ? "Driver" : "Cost"}
            </Text>
          </Pressable>
        </View>
        )}
      </View>
  );

  const adjustmentLinesEl = (
    <View style={styles.linesBlock}>
      <View style={[styles.table, isDesktop && styles.tableDesktop, props.linesOnly && styles.tableFlush]}>
        {toolbarEl}
        {visibleRows.length > 0 ? (
        <View style={[styles.tableHead, isDesktop && styles.tableHeadDesktop]}>
          <View style={[styles.colPartyLane, isDesktop && styles.colPartyLaneDesktop]}>
            <Text style={[styles.th, isDesktop && styles.thDesktop]} numberOfLines={1}>
              Party
            </Text>
          </View>
          {isDesktop ? (
            <>
              <View style={styles.colNote}>
                <Text style={[styles.th, styles.thDesktop]} numberOfLines={1}>
                  Note
                </Text>
              </View>
              <View style={styles.colReason}>
                <Text style={[styles.th, styles.thDesktop]} numberOfLines={1}>
                  Reason
                </Text>
              </View>
              <View style={[styles.colAdded, { width: colAdded }]}>
                <Text style={[styles.th, styles.thDesktop]} numberOfLines={1}>
                  Added
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.colNoteReason}>
              <Text style={styles.th} numberOfLines={1}>
                Note / reason
              </Text>
            </View>
          )}
          <View style={[styles.colAmt, { width: colAmt }]}>
            <Text style={[styles.th, styles.thAmt, isDesktop && styles.thDesktop]} numberOfLines={1}>
              Amount
            </Text>
          </View>
        </View>
        ) : null}

        {visibleRows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.empty, isDesktop && styles.emptyDesktop]}>
              {rows.length === 0
                ? "No provisions yet — tap Sale or Cost to add a CN/DN."
                : "No CN / DN for this party."}
            </Text>
          </View>
        ) : (
          visibleRows.map((adj) => {
            const voided = isAdjustmentVoided(adj);
            const isSale = adj.type === "revenue";
            const partyName = isSale ? props.clientName : props.supplierName;
            const costEntityType = props.isAssetExecution ? "driver" : "supplier";
            const isSelected = selectedRowId === adj.id;
            const canEdit = !voided && typeof props.onEditAdjustment === "function";
            const reasonText = (adj.reason ?? "").trim() || "—";
            const addedAt = formatAdjustmentAddedAt(adj.created_at);
            const addedBy = resolveAdjustmentAddedBy(adj, actorNames, {
              userId: currentUserId,
              name: currentUserName,
            });
            const notePill = (
              <Pressable
                style={[
                  styles.notePill,
                  adj.impact === "minus" ? styles.notePillCn : styles.notePillDn,
                  voided && styles.notePillVoided,
                ]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  props.onViewNotePdf?.(adj);
                }}
                disabled={!props.onViewNotePdf}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`View ${cnDnLabel(adj.impact)} PDF`}
              >
                <Text
                  style={[
                    styles.notePillText,
                    adj.impact === "minus" ? styles.noteCn : styles.noteDn,
                    voided && styles.struck,
                  ]}
                >
                  {cnDnLabel(adj.impact)}
                </Text>
                {props.onViewNotePdf ? (
                  <Feather
                    name="file-text"
                    size={9}
                    color={adj.impact === "minus" ? Theme.primary : Theme.negative}
                    style={styles.notePillIcon}
                  />
                ) : null}
              </Pressable>
            );
            return (
              <View key={adj.id} style={styles.trWrap}>
              <Pressable
                style={[
                  styles.tr,
                  isDesktop && styles.trDesktop,
                  voided && styles.trVoided,
                  isSelected && styles.trSelected,
                ]}
                onPress={() =>
                  setSelectedRowId((prev) => (prev === adj.id ? null : adj.id))
                }
              >
                <View style={[styles.colPartyLane, isDesktop && styles.colPartyLaneDesktop]}>
                  <EntityAvatar
                    name={partyName}
                    avatarUrl={isSale ? props.clientAvatarUrl : props.supplierAvatarUrl}
                    avatarSeed={isSale ? props.clientAvatarSeed : props.supplierAvatarSeed}
                    organizationImageUrl={
                      isSale
                        ? props.clientOrganizationImageUrl
                        : props.supplierOrganizationImageUrl
                    }
                    organizationAvatarSeed={
                      isSale
                        ? props.clientOrganizationAvatarSeed
                        : props.supplierOrganizationAvatarSeed
                    }
                    isIntegrated={
                      isSale ? props.clientIntegrated : props.supplierIntegrated
                    }
                    entityType={isSale ? "client" : costEntityType}
                    size={isDesktop ? 22 : 20}
                    showIntegrationBadge={false}
                  />
                  <Text
                    style={[
                      styles.partyCell,
                      isDesktop && styles.partyCellDesktop,
                      voided && styles.struck,
                    ]}
                    numberOfLines={1}
                  >
                    {partyName}
                  </Text>
                </View>
                {isDesktop ? (
                  <>
                    <View style={styles.colNote}>{notePill}</View>
                    <View style={styles.colReason}>
                      <Text
                        style={[
                          styles.td,
                          styles.tdReason,
                          styles.tdDesktop,
                          voided && styles.struck,
                        ]}
                        numberOfLines={2}
                      >
                        {reasonText}
                      </Text>
                    </View>
                    <View style={[styles.colAdded, { width: colAdded }]}>
                      <Text
                        style={[styles.addedAt, voided && styles.struck]}
                        numberOfLines={1}
                      >
                        {addedAt}
                      </Text>
                      <Text
                        style={[styles.addedBy, voided && styles.struck]}
                        numberOfLines={1}
                      >
                        {addedBy}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.colNoteReason}>
                    {notePill}
                    <Text
                      style={[
                        styles.td,
                        styles.tdReason,
                        voided && styles.struck,
                      ]}
                      numberOfLines={2}
                    >
                      {reasonText}
                    </Text>
                  </View>
                )}
                <View style={[styles.colAmt, { width: colAmt }]}>
                  <Text
                    style={[
                      styles.td,
                      styles.tdAmt,
                      isDesktop && styles.tdAmtDesktop,
                      adj.impact === "minus" ? styles.amtCn : styles.amtDn,
                      voided && styles.struck,
                    ]}
                    numberOfLines={1}
                  >
                    {adj.impact === "plus" ? "+" : "−"}
                    {formatINR(adj.amount)}
                  </Text>
                </View>
              </Pressable>
              {!isDesktop ? (
                <View style={styles.addedMobile}>
                  <Text style={[styles.addedAt, voided && styles.struck]} numberOfLines={1}>
                    {addedAt}
                    {addedBy !== "—" ? ` · ${addedBy}` : ""}
                  </Text>
                </View>
              ) : null}

              {isSelected ? (
                <View style={styles.rowActions}>
                  {props.onViewNotePdf ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowActionBtn,
                        pressed && styles.rowActionBtnPressed,
                      ]}
                      onPress={() => props.onViewNotePdf?.(adj)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${cnDnLabel(adj.impact)} PDF`}
                    >
                      <Feather name="file-text" size={12} color={LINK} />
                      <Text style={styles.rowActionBtnText}>View PDF</Text>
                    </Pressable>
                  ) : null}
                  {canEdit ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowActionBtn,
                        styles.rowActionBtnPrimary,
                        pressed && styles.rowActionBtnPressed,
                      ]}
                      onPress={() => props.onEditAdjustment?.(adj)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${cnDnLabel(adj.impact)}`}
                    >
                      <Feather name="edit-2" size={12} color={LINK} />
                      <Text style={styles.rowActionBtnTextPrimary}>
                        Edit {cnDnLabel(adj.impact)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              </View>
            );
          })
        )}
      </View>
    </View>
  );

  if (props.linesOnly) {
    return (
      <View style={[styles.card, isDesktop && styles.cardDesktop, styles.linesOnlyCard]}>
        {adjustmentLinesEl}
      </View>
    );
  }

  return (
    <View style={[styles.card, isDesktop && styles.cardDesktop]}>
      {!isDesktop ? (
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, isDesktop && styles.titleDesktop]}>
            Provision adjustments
          </Text>
          <Text style={[styles.hint, isDesktop && styles.hintDesktop]}>
            {props.isAssetExecution
              ? "Customer sale vs driver cost & posted expenses"
              : "Revised sale & cost after CN/DN lines"}
          </Text>
        </View>
        <View style={[styles.badge, isDesktop && styles.badgeDesktop]}>
          <Text style={[styles.badgeText, isDesktop && styles.badgeTextDesktop]}>
            {activeCount}
          </Text>
        </View>
      </View>
      ) : null}

      {!isDesktop && props.capturePaymentSlot ? (
        <View style={styles.mobileCaptureFirst}>{props.capturePaymentSlot}</View>
      ) : null}
      {!isDesktop && props.exchangeSlot ? (
        <View style={styles.mobileCaptureFirst}>{props.exchangeSlot}</View>
      ) : null}

      {props.onRequestDeduction && passThroughRecommendations.length > 0 ? (
        <ProvisionPassThroughCard
          recommendations={passThroughRecommendations}
          isAssetExecution={Boolean(props.isAssetExecution)}
          onRequestDeduction={props.onRequestDeduction}
        />
      ) : null}

      {!isDesktop ? adjustmentLinesEl : null}

      {isDesktop ? props.capturePaymentSlot : null}
      {isDesktop ? props.exchangeSlot : null}

      {isDesktop ? (
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, isDesktop && styles.titleDesktop]}>
            Provision adjustments
          </Text>
          <Text style={[styles.hint, isDesktop && styles.hintDesktop]}>
            {props.isAssetExecution
              ? "Customer sale vs driver cost & posted expenses"
              : "Revised sale & cost after CN/DN lines"}
          </Text>
        </View>
        <View style={[styles.badge, isDesktop && styles.badgeDesktop]}>
          <Text style={[styles.badgeText, isDesktop && styles.badgeTextDesktop]}>
            {activeCount}
          </Text>
        </View>
      </View>
      ) : null}

      {isDesktop ? (
        <ProvisionRevisedPartiesCard
          clientName={props.clientName}
          clientAvatarUrl={props.clientAvatarUrl}
          clientAvatarSeed={props.clientAvatarSeed}
          clientOrganizationImageUrl={props.clientOrganizationImageUrl}
          clientOrganizationAvatarSeed={props.clientOrganizationAvatarSeed}
          clientIntegrated={props.clientIntegrated}
          sales={props.sales}
          adjSales={props.adjSales}
          revenueSideDelta={props.revenueSideDelta}
          supplierName={props.supplierName}
          supplierAvatarUrl={props.supplierAvatarUrl}
          supplierAvatarSeed={props.supplierAvatarSeed}
          supplierOrganizationImageUrl={props.supplierOrganizationImageUrl}
          supplierOrganizationAvatarSeed={props.supplierOrganizationAvatarSeed}
          supplierIntegrated={props.supplierIntegrated}
          cost={props.cost}
          adjCost={props.adjCost}
          costSideDelta={props.costSideDelta}
          costLaneLabel={props.costLaneLabel}
          costPartyEntityType={props.isAssetExecution ? "driver" : "supplier"}
          costBreakdownLines={props.costBreakdownLines}
          costUnset={props.costUnset}
          onSelectSide={props.onOpenProvision}
          layout={layout}
        />
      ) : null}
      {isDesktop ? adjustmentLinesEl : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginTop: 0,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  linesOnlyCard: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: "transparent",
    gap: 0,
  },
  linesBlock: {
    gap: 0,
  },
  mobileCaptureFirst: {
    marginBottom: 2,
  },
  cardDesktop: {
    marginTop: 0,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
    textTransform: "none",
    color: INK,
    lineHeight: 18,
  },
  titleDesktop: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    lineHeight: 14,
  },
  hint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 15,
    color: MUTED,
  },
  hintDesktop: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CANVAS,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeDesktop: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: BODY,
    fontVariant: ["tabular-nums"],
  },
  badgeTextDesktop: {
    fontSize: 11,
  },
  tableToolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
    backgroundColor: Theme.cardWhite,
  },
  tableToolbarMobile: {
    flexWrap: "wrap",
    minHeight: 0,
  },
  viewTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
  },
  viewTab: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  viewTabOn: {
    backgroundColor: Theme.cardWhite,
  },
  viewTabText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  viewTabTextOn: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
  },
  partyList: {
    gap: 8,
  },
  partyNameRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  partyNameChip: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "52%",
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  partyNameChipOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.compliancePageBg,
  },
  partyNameChipText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  partyNameChipTextOn: {
    fontWeight: "600",
  },
  partyCard: {
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  partyCardDesktop: {
    paddingHorizontal: 12,
  },
  partyHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  partyHeadCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  partyHeadName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  partyHeadMeta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  partyHeadAmt: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  partyHeadRevised: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  partyHeadNet: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  partyFacts: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  partyFact: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  partyEmpty: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  partyNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  partyNoteReason: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  partyNoteAmt: {
    flexShrink: 0,
    minWidth: 72,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  tableTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    textTransform: "none",
    color: INK,
    lineHeight: 14,
  },
  tableTitleDesktop: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 12,
  },
  toolbarActions: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 6 },
  addBtnDesktop: {
    height: 32,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  addBtnTextDesktop: {
    fontSize: 12,
  },
  addBtnSale: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(40,116,240,0.08)",
  },
  addBtnSaleText: {
    fontSize: 11,
    fontWeight: "600",
    color: LINK,
    textTransform: "none",
    letterSpacing: 0,
  },
  addBtnCost: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(225,29,72,0.08)",
  },
  addBtnCostText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
    textTransform: "none",
    letterSpacing: 0,
  },
  table: {
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    backgroundColor: Theme.cardWhite,
  },
  tableDesktop: {
    borderRadius: 8,
  },
  tableFlush: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CANVAS,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
  },
  tableHeadDesktop: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  th: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
    color: MUTED,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  thDesktop: {
    fontSize: 10,
    lineHeight: 13,
  },
  thAmt: {
    textAlign: "right",
    width: "100%",
  },
  colPartyLane: {
    flex: 1.1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  colPartyLaneDesktop: {
    flex: 1,
    minWidth: 128,
    maxWidth: 200,
    gap: 8,
    paddingRight: 10,
  },
  colNote: {
    width: COL_NOTE,
    flexShrink: 0,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  colReason: {
    flex: 1.2,
    minWidth: 80,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  colNoteReason: {
    flex: 1.45,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  colAdded: {
    width: COL_ADDED,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingRight: 8,
    gap: 1,
  },
  colAmt: {
    width: COL_AMT,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  addedAt: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: BODY,
    fontVariant: ["tabular-nums"],
  },
  addedBy: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: INK,
  },
  addedMobile: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    marginTop: -4,
  },
  emptyWrap: {
    minHeight: 48,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  empty: {
    fontSize: 12,
    fontWeight: "400",
    color: MUTED,
    textAlign: "left",
    lineHeight: 18,
  },
  emptyDesktop: {
    fontSize: 13,
    lineHeight: 18,
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
  },
  trDesktop: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  trWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
    backgroundColor: Theme.cardWhite,
  },
  trSelected: {
    backgroundColor: "#FAFBFF",
  },
  rowActions: {
    flexDirection: "row",
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEEEE",
    backgroundColor: CANVAS,
  },
  rowActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    minHeight: 44,
    backgroundColor: CANVAS,
  },
  rowActionBtnPrimary: {
    backgroundColor: CANVAS,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#E0E0E0",
  },
  rowActionBtnPressed: {
    opacity: 0.75,
    backgroundColor: "#EEEEEE",
  },
  rowActionBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: LINK,
  },
  rowActionBtnTextPrimary: {
    fontSize: 12,
    fontWeight: "500",
    color: LINK,
  },
  trVoided: { opacity: 0.55 },
  td: {
    fontSize: 12,
    fontWeight: "400",
    color: BODY,
    lineHeight: 16,
  },
  tdDesktop: {
    fontSize: 11,
    lineHeight: 15,
  },
  partyCell: {
    flex: 1,
    fontStyle: "normal",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: INK,
    minWidth: 0,
    textTransform: "none",
  },
  partyCellDesktop: {
    fontSize: 11,
    lineHeight: 14,
  },
  laneChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  laneChipSale: {
    backgroundColor: "rgba(40,116,240,0.08)",
    borderColor: "rgba(40,116,240,0.2)",
  },
  laneChipCost: {
    backgroundColor: "rgba(15,118,110,0.08)",
    borderColor: "rgba(15,118,110,0.2)",
  },
  laneChipVoided: {
    opacity: 0.75,
  },
  laneChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  laneChipTextSale: {
    color: LINK,
  },
  laneChipTextCost: {
    color: "#0f766e",
  },
  notePill: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  notePillIcon: {
    marginTop: 0,
  },
  notePillCn: {
    backgroundColor: "rgba(40,116,240,0.1)",
  },
  notePillDn: {
    backgroundColor: "rgba(225,29,72,0.08)",
  },
  notePillVoided: {
    opacity: 0.7,
  },
  notePillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  noteCn: { color: LINK },
  noteDn: { color: Theme.negative },
  tdReason: {
    flex: 1,
    minWidth: 0,
    fontWeight: "400",
    color: BODY,
    fontSize: 12,
    lineHeight: 16,
  },
  tdAmt: {
    fontSize: 12,
    textAlign: "right",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 16,
  },
  tdAmtDesktop: {
    fontSize: 11,
    lineHeight: 15,
  },
  amtSale: { color: Theme.gpayAmountReceived },
  amtCost: { color: Theme.teslaRed },
  amtCn: { color: Theme.primary },
  amtDn: { color: Theme.negative },
  struck: {
    textDecorationLine: "line-through",
    opacity: 0.75,
  },
});
