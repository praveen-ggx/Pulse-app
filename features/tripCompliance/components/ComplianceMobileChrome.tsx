import {
  HubMobileScreenHeader,
  HubMobileSearchRow,
  HubMobileUnderlineTab,
  hubMobileChromeStyles as hubChrome,
} from "@/components/hub";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ComplianceQueueFilter } from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Download, Package, Wallet } from "lucide-react-native";
import React, { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ComplianceMobileStageItem = {
  id: ComplianceQueueFilter;
  label: string;
  count: number;
  caption?: string;
};

export function ComplianceMobileChrome({
  search,
  onSearchChange,
  stages,
  stage,
  onSelectStage,
  subFilter,
  extraFilters,
  canBulkPay,
  bulkLabel = "Bulk Payment",
  onBulkPay,
  canExport,
  onExport,
  exportLabel = "Export",
  refreshControl,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  stages: readonly ComplianceMobileStageItem[];
  stage: ComplianceQueueFilter;
  onSelectStage: (next: ComplianceQueueFilter) => void;
  subFilter?: ReactNode;
  extraFilters?: ReactNode;
  canBulkPay?: boolean;
  bulkLabel?: string;
  onBulkPay?: () => void;
  canExport?: boolean;
  onExport?: () => void;
  exportLabel?: string;
  refreshControl?: ReactNode;
}) {
  return (
    <View style={styles.chrome} accessibilityRole="header">
      <HubMobileScreenHeader
        title="Compliance"
        action={
          <View style={styles.headerActions}>
            {refreshControl}
            {canExport && onExport ? (
              <TouchableOpacity
                onPress={onExport}
                style={styles.headerAction}
                accessibilityRole="button"
                accessibilityLabel={exportLabel}
                hitSlop={Layout.touchTargetHitSlop}
              >
                <Download size={16} color={Theme.textPrimaryDark} strokeWidth={2.1} />
              </TouchableOpacity>
            ) : null}
            {canBulkPay && onBulkPay ? (
              <TouchableOpacity
                onPress={onBulkPay}
                style={[styles.headerAction, styles.headerActionPrimary]}
                accessibilityRole="button"
                accessibilityLabel={bulkLabel}
                hitSlop={Layout.touchTargetHitSlop}
              >
                {bulkLabel === "Log Bulk POD" ? (
                  <Package size={16} color={Theme.buttonDarkText} strokeWidth={2.1} />
                ) : (
                  <Wallet size={16} color={Theme.buttonDarkText} strokeWidth={2.1} />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
      <View style={[hubChrome.tabHeaderRow, styles.tabRow]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={hubChrome.primaryTabsScroll}
          contentContainerStyle={hubChrome.primaryTabsContent}
          keyboardShouldPersistTaps="handled"
          accessibilityRole="tablist"
        >
          {stages.map((item) => (
            <HubMobileUnderlineTab
              key={item.id}
              label={`${item.label} (${item.count})`}
              isActive={stage === item.id}
              onPress={() => onSelectStage(item.id)}
              accessibilityLabel={
                item.caption
                  ? `${item.label}, ${item.caption}, ${item.count} trips`
                  : `${item.label}, ${item.count} trips`
              }
            />
          ))}
        </ScrollView>
      </View>
      <View style={hubChrome.tabDivider} />
      <HubMobileSearchRow
        value={search}
        onChange={onSearchChange}
        placeholder="Search trip, vehicle, driver…"
        accessibilityLabel="Search compliance trips"
      />
      {subFilter ? <View style={styles.subFilter}>{subFilter}</View> : null}
      {extraFilters ? <View style={styles.extraFilters}>{extraFilters}</View> : null}
    </View>
  );
}

export function ComplianceMobileReviewHeader({
  title,
  subtitle,
  onBack,
  trailing,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.reviewBar} accessibilityRole="header">
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to compliance queue"
        hitSlop={Layout.touchTargetHitSlop}
      >
        <FontAwesome name="chevron-left" size={16} color="#212121" />
      </TouchableOpacity>
      <View style={styles.reviewCopy}>
        <Text style={styles.reviewTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.reviewSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    ...hubChrome.shell,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 2,
    paddingBottom: 4,
    backgroundColor: Theme.screenBackground,
  },
  tabRow: {
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  headerActionPrimary: {
    backgroundColor: Theme.actionBtnInk,
  },
  subFilter: {
    marginTop: 2,
  },
  extraFilters: {
    marginTop: 2,
  },
  reviewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 36,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    marginLeft: 2,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#212121",
    letterSpacing: -0.2,
  },
  reviewSubtitle: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#9E9E9E",
  },
});
