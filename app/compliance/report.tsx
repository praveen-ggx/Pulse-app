/**
 * Compliance report — combines canonical Trip + Compliance + Finance + POD
 * data (via buildComplianceTripSummaries, the same read path the list page
 * uses). CSV export only — no separate reporting database, per the spec.
 */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import {
  complianceReportToCsv,
  fetchComplianceReportRows,
  type ComplianceReportFilters,
  type ComplianceReportRow,
} from "@/features/tripCompliance/services/tripComplianceReport.service";
import { COMPLIANCE_STAGE_FILTER_LABEL, COMPLIANCE_STAGES } from "@/features/tripCompliance/tripCompliance.types";

function triggerWebDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

async function exportCsv(csv: string, fileName: string) {
  if (Platform.OS === "web") {
    triggerWebDownload(new Blob([csv], { type: "text/csv" }), fileName);
    return;
  }
  const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
  if (!cacheDirectory) throw new Error("No cache directory available");
  const uri = `${cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: "utf8" });
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (sharingAvailable) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Save or share Compliance report" });
  } else {
    await Share.share({ url: uri, title: "Compliance Report" });
  }
}

const PAYMENT_STATUS_OPTIONS: { id: ComplianceReportFilters["paymentStatus"]; label: string }[] = [
  { id: "any", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "advance_paid", label: "Advance paid" },
  { id: "balance_paid", label: "Settled" },
];

export default function ComplianceReportScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canViewFinance = canSurface("trip_compliance.finance.view");
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const orgCtx = useOptionalOrganization();
  const orgId = orgCtx?.currentOrganization?.id ?? "";

  const goBackToCompliance = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.COMPLIANCE as Parameters<typeof router.replace>[0]);
  }, [router]);

  const [stage, setStage] = useState<ComplianceReportFilters["stage"]>("all");
  const [paymentStatus, setPaymentStatus] = useState<ComplianceReportFilters["paymentStatus"]>("any");
  const [rows, setRows] = useState<ComplianceReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;

  const runReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchComplianceReportRows(orgId, { stage, paymentStatus });
      setRows(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId, stage, paymentStatus]);

  const handleExport = useCallback(async () => {
    if (!rows) return;
    setExporting(true);
    try {
      await exportCsv(complianceReportToCsv(rows), `compliance-report-${Date.now()}.csv`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }, [rows]);

  if (orgCtx === undefined || accessLoading || productsLoading) return <ChromeBelowTopNavLoadingScreen variant="preparing" />;

  // Mirrors /compliance's own gate — RBAC alone isn't enough, the workspace
  // toggle must also be on, or this screen stays reachable via direct URL
  // while the workspace has Compliance turned off.
  if (!complianceEnabled || !canViewFinance) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>
          {!complianceEnabled
            ? "Compliance is not enabled for this workspace."
            : "You don't have access to the Compliance report."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: contentTopInset }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: layout.scrollBottomPadding(24), paddingHorizontal: Layout.screenPaddingHorizontal },
      ]}
    >
      <TouchableOpacity
        onPress={goBackToCompliance}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to Compliance Verification"
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <ChevronLeft size={16} color={Theme.textMuted} strokeWidth={2.2} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Compliance Report</Text>

      <Text style={styles.subheader}>Compliance stage</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScrollContent}
      >
        <TouchableOpacity onPress={() => setStage("all")} style={[styles.chip, stage === "all" && styles.chipActive]}>
          <Text style={[styles.chipText, stage === "all" && styles.chipTextActive]} numberOfLines={1}>
            All
          </Text>
        </TouchableOpacity>
        {COMPLIANCE_STAGES.map((s) => (
          <TouchableOpacity key={s} onPress={() => setStage(s)} style={[styles.chip, stage === s && styles.chipActive]}>
            <Text style={[styles.chipText, stage === s && styles.chipTextActive]} numberOfLines={1}>
              {COMPLIANCE_STAGE_FILTER_LABEL[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.subheader}>Payment status</Text>
      <View style={styles.chipRowWrap}>
        {PAYMENT_STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            onPress={() => setPaymentStatus(opt.id)}
            style={[styles.chip, paymentStatus === opt.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, paymentStatus === opt.id && styles.chipTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={runReport} disabled={loading}>
        <Text style={styles.primaryBtnText}>{loading ? "Running…" : "Run Report"}</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} color={Theme.textMuted} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {rows ? (
        <View style={styles.resultsWrap}>
          <Text style={styles.subheader}>{rows.length} trips matched</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleExport} disabled={exporting || rows.length === 0}>
            <Text style={styles.secondaryBtnText}>{exporting ? "Exporting…" : "Export CSV"}</Text>
          </TouchableOpacity>
          {rows.slice(0, 25).map((r) => (
            <View key={r.tripId} style={styles.rowPreview}>
              <Text style={styles.rowPreviewTitle}>
                {r.tripId} · {r.client}
              </Text>
              <Text style={styles.rowPreviewMeta}>
                {r.complianceStatus} · Advance {r.advanceStatus} · Balance {r.balanceStatus} · {r.settlementStatus}
              </Text>
            </View>
          ))}
          {rows.length > 25 ? (
            <Text style={styles.message}>Showing first 25 of {rows.length} — export CSV for the full set.</Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.compliancePageBg },
  content: { paddingTop: Layout.spacingMedium, gap: Layout.spacingLarge },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: Layout.minTouchTargetSize,
  },
  backText: { fontSize: 13, fontWeight: "600", color: Theme.textMuted },
  title: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark, lineHeight: 24 },
  subheader: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  chipScrollContent: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2, paddingRight: 4 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    minHeight: 40,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  chipText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  chipTextActive: { color: Theme.buttonDarkText },
  primaryBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontSize: 14, color: Theme.buttonDarkText, fontWeight: "700" },
  secondaryBtn: { minHeight: Layout.minTouchTargetSize, paddingVertical: 8, alignItems: "flex-start", justifyContent: "center" },
  secondaryBtnText: { fontSize: 13, color: Theme.complianceBulk, fontWeight: "700" },
  errorText: { fontSize: 13, color: Theme.teslaRed },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.compliancePageBg },
  message: { fontSize: 13, color: Theme.textMuted },
  resultsWrap: { gap: 8 },
  rowPreview: { borderTopWidth: 1, borderTopColor: Theme.border, paddingVertical: 10 },
  rowPreviewTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary },
  rowPreviewMeta: { fontSize: 12, color: Theme.textMuted, marginTop: 4, lineHeight: 18 },
});
