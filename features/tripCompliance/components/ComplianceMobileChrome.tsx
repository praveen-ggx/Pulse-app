import {
  HubMobileScreenHeader,
  HubMobileSearchRow,
  HubMobileUnderlineTab,
  hubMobileChromeStyles as hubChrome,
} from "@/components/hub";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ComplianceQueueFilter } from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import { ChevronLeft, Download, Wallet } from "lucide-react-native";
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
  onBulkPay,
  canExport,
  onExport,
  exportLabel = "Export",
}: {
  search: string;
  onSearchChange: (value: string) => void;
  stages: readonly ComplianceMobileStageItem[];
  stage: ComplianceQueueFilter;
  onSelectStage: (next: ComplianceQueueFilter) => void;
  subFilter?: ReactNode;
  extraFilters?: ReactNode;
  canBulkPay?: boolean;
  onBulkPay?: () => void;
  canExport?: boolean;
  onExport?: () => void;
  exportLabel?: string;
}) {
  return (
    <View style={styles.chrome} accessibilityRole="header">
      <HubMobileScreenHeader
        title="Compliance"
        action={
          <View style={styles.headerActions}>
            {canExport && onExport ? (
              <TouchableOpacity
                onPress={onExport}
                style={styles.headerAction}
                accessibilityRole="button"
                accessibilityLabel={exportLabel}
                hitSlop={Layout.touchTargetHitSlop}
              >
                <Download size={18} color={Theme.textPrimaryDark} strokeWidth={2.1} />
              </TouchableOpacity>
            ) : null}
            {canBulkPay && onBulkPay ? (
              <TouchableOpacity
                onPress={onBulkPay}
                style={[styles.headerAction, styles.headerActionPrimary]}
                accessibilityRole="button"
                accessibilityLabel="Bulk Payment"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <Wallet size={17} color={Theme.buttonDarkText} strokeWidth={2.1} />
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
      <View style={hubChrome.tabHeaderRow}>
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
              label={item.count > 0 ? `${item.label} ${item.count}` : item.label}
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
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
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
        <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.2} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    ...hubChrome.shell,
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAction: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  headerActionPrimary: {
    backgroundColor: Theme.actionBtnInk,
  },
  subFilter: {
    marginTop: 4,
  },
  extraFilters: {
    marginTop: 4,
  },
  reviewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: Layout.minTouchTargetSize,
    paddingBottom: 8,
  },
  backBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  reviewTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: Theme.textPrimaryDark,
  },
  reviewSubtitle: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
