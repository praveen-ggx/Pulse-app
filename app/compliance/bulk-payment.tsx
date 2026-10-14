/**
 * Bulk compliance payment import — Upload → Validate → Preview → Confirm →
 * Process. Every accepted row still posts through the canonical
 * `postCompliancePayment()` → `createLedgerEntry()` → `transactions` path
 * (see tripComplianceBulkPayment.service.ts) — this screen only handles
 * file I/O and the review UI, no direct ledger writes.
 */
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
// expo-file-system SDK 54 moved readAsStringAsync to the legacy entry (matches
// the existing convention in features/chat/utils/chatDocumentPick.util.ts).
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { syncFinanceComplianceCaches } from "@/lib/queries/syncFinanceComplianceCaches";
import {
  parseComplianceBulkPaymentCsv,
  processComplianceBulkPayments,
  validateComplianceBulkPayments,
  type ComplianceBulkPaymentRow,
  type ComplianceBulkRowValidation,
} from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { TripRow } from "@/features/trips/services/trips.service";

async function readUriAsText(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.text();
  }
  return FileSystem.readAsStringAsync(uri, { encoding: "utf8" });
}

type Step = "upload" | "validating" | "preview" | "confirm" | "processing" | "done";

export default function ComplianceBulkPaymentScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const orgCtx = useOptionalOrganization();
  const orgId = orgCtx?.currentOrganization?.id ?? "";

  const [category, setCategory] = useState<ComplianceLedgerCategory>("compliance_advance");
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [valid, setValid] = useState<ComplianceBulkRowValidation[]>([]);
  const [invalid, setInvalid] = useState<ComplianceBulkRowValidation[]>([]);
  const [blocked, setBlocked] = useState<ComplianceBulkRowValidation[]>([]);
  const [alreadyPaid, setAlreadyPaid] = useState<ComplianceBulkRowValidation[]>([]);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [tripsById, setTripsById] = useState<Map<string, TripRow>>(new Map());
  const [results, setResults] = useState<{ rowIndex: number; error: Error | null }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;

  const reset = useCallback(() => {
    setStep("upload");
    setFileName(null);
    setValid([]);
    setInvalid([]);
    setBlocked([]);
    setAlreadyPaid([]);
    setEligibleTotal(0);
    setResults([]);
    setLoadError(null);
  }, []);

  const handlePick = useCallback(async () => {
    setLoadError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setFileName(asset.name ?? "payments.csv");
    setStep("validating");
    try {
      const text = await readUriAsText(asset.uri);
      const rows: ComplianceBulkPaymentRow[] = parseComplianceBulkPaymentCsv(text);
      if (rows.length === 0) {
        setLoadError("The file is empty or malformed — expected a header row plus at least one data row.");
        setStep("upload");
        return;
      }
      const result = await validateComplianceBulkPayments({ organizationId: orgId, category, rows });
      setValid(result.valid);
      setInvalid(result.invalid);
      setBlocked(result.blocked);
      setAlreadyPaid(result.alreadyPaid);
      setEligibleTotal(result.eligibleTotal);
      setTripsById(result.tripsById);
      setStep("preview");
    } catch (e) {
      setLoadError((e as Error).message);
      setStep("upload");
    }
  }, [orgId, category]);

  const handleProcess = useCallback(async (rows: ComplianceBulkRowValidation[]) => {
    setStep("processing");
    const outcomes = await processComplianceBulkPayments({
      organizationId: orgId,
      category,
      rows,
      tripsById,
    });
    setResults(outcomes);
    const succeededTripIds = outcomes
      .filter((o) => !o.error)
      .map((o) => rows.find((r) => r.row.rowIndex === o.rowIndex)?.row.tripId)
      .filter((id): id is string => Boolean(id));
    if (orgId && succeededTripIds.length > 0) {
      syncFinanceComplianceCaches({
        queryClient,
        organizationId: orgId,
        tripId: succeededTripIds[0],
      });
      // Pipeline + ledger for remaining trips — org-scoped invalidation already covers lists.
      for (const tripId of succeededTripIds.slice(1)) {
        syncFinanceComplianceCaches({
          queryClient,
          organizationId: orgId,
          tripId,
          includeFinance: false,
        });
      }
    }
    setStep("done");
  }, [orgId, category, tripsById, queryClient]);

  const succeeded = useMemo(() => results.filter((r) => !r.error).length, [results]);
  const failed = useMemo(() => results.filter((r) => r.error).length, [results]);

  if (orgCtx === undefined || accessLoading || productsLoading) return <ChromeBelowTopNavLoadingScreen variant="preparing" />;

  // Mirrors /compliance's own gate — RBAC alone isn't enough, the workspace
  // toggle must also be on, or this screen stays reachable via direct URL
  // while the workspace has Compliance turned off.
  if (!complianceEnabled || !canManageFinance) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>
          {!complianceEnabled
            ? "Compliance is not enabled for this workspace."
            : "You don't have access to bulk compliance payments."}
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
      <Text style={styles.title}>Bulk Payment Upload</Text>
      <Text style={styles.subtitle}>
        CSV columns: Trip ID, Amount, Mode, Date, UTR, Remarks (header row required).
      </Text>

      <View style={styles.categoryRow}>
        {(["compliance_advance", "compliance_balance"] as const).map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => {
              setCategory(c);
              reset();
            }}
            style={[styles.categoryChip, category === c && styles.categoryChipActive]}
          >
            <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
              {c === "compliance_advance" ? "Advance" : "Balance"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {step === "upload" ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={handlePick}>
          <Text style={styles.primaryBtnText}>Select CSV</Text>
        </TouchableOpacity>
      ) : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {step === "validating" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Validating {fileName}…</Text>
        </View>
      ) : null}

      {step === "preview" ? (
        <View style={styles.previewWrap}>
          <Text style={styles.subheader}>
            Eligible {valid.length} · Blocked {blocked.length} · Already paid {alreadyPaid.length} · Invalid{" "}
            {invalid.length}
          </Text>
          <Text style={styles.subtitle}>Total payable (eligible): ₹{eligibleTotal.toLocaleString("en-IN")}</Text>
          {blocked.map((r) => (
            <Text key={`b-${r.row.rowIndex}`} style={styles.message}>
              Blocked row {r.row.rowIndex} ({r.row.tripId}): {r.gateReason}
            </Text>
          ))}
          {alreadyPaid.map((r) => (
            <Text key={`a-${r.row.rowIndex}`} style={styles.message}>
              Already paid row {r.row.rowIndex} ({r.row.tripId}): {r.gateReason}
            </Text>
          ))}
          {invalid.length > 0 ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorBlockTitle}>Invalid rows (not processed)</Text>
              {invalid.map((r) => (
                <Text key={r.row.rowIndex} style={styles.errorRow}>
                  Row {r.row.rowIndex} ({r.row.tripId || "—"}): {r.errors.join("; ")}
                </Text>
              ))}
            </View>
          ) : null}
          {valid.length > 0 ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("confirm")}>
              <Text style={styles.primaryBtnText}>
                Review confirmation for {valid.length} trips (₹{eligibleTotal.toLocaleString("en-IN")})
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.message}>No eligible rows to process.</Text>
          )}
          <TouchableOpacity onPress={reset} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Start over</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={styles.previewWrap}>
          <Text style={styles.subheader}>
            Confirm payment of ₹{eligibleTotal.toLocaleString("en-IN")} for {valid.length} trips
          </Text>
          <Text style={styles.subtitle}>
            Eligible {valid.length} will post. Blocked {blocked.length} and already paid {alreadyPaid.length} will be
            skipped. Invalid {invalid.length} will not run.
          </Text>
          <Text style={styles.warning}>
            Retry is not guaranteed safe. Duplicate posts are only guarded by a client read of existing transactions —
            not a database unique constraint.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void handleProcess(valid)}
            disabled={valid.length === 0}
          >
            <Text style={styles.primaryBtnText}>
              Confirm payment of ₹{eligibleTotal.toLocaleString("en-IN")} for {valid.length} trips
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("preview")} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Back to review</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === "processing" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Processing {valid.length} payments…</Text>
        </View>
      ) : null}

      {step === "done" ? (
        <View style={styles.previewWrap}>
          <Text style={styles.subheader}>Payment batch completed</Text>
          <Text style={styles.subtitle}>
            Successful {succeeded} · Failed {failed} · Skipped {blocked.length + alreadyPaid.length} · Invalid{" "}
            {invalid.length}
          </Text>
          {results
            .filter((r) => r.error)
            .map((r) => (
              <Text key={r.rowIndex} style={styles.errorRow}>
                Failed row {r.rowIndex}: {r.error?.message}
              </Text>
            ))}
          {failed > 0 ? (
            <>
              <Text style={styles.warning}>
                {failed} failed {failed === 1 ? "row is" : "rows are"} listed above. Retry is disabled because payment
                idempotency is not guaranteed. Duplicate posts are only guarded by a client read of existing
                transactions — not a database unique constraint.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.primaryBtnDisabled]}
                disabled
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                accessibilityLabel="Retry unavailable — payment idempotency is not guaranteed"
              >
                <Text style={styles.primaryBtnText}>Retry unavailable — payment idempotency is not guaranteed.</Text>
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity onPress={reset} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Upload another file</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Back to Compliance</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.compliancePageBg },
  content: { paddingTop: Layout.spacingMedium, gap: Layout.spacingLarge },
  title: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark, lineHeight: 24 },
  subtitle: { fontSize: 13, color: Theme.textMuted, lineHeight: 18 },
  subheader: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary, marginBottom: 6 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    justifyContent: "center",
  },
  categoryChipActive: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  categoryChipText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  categoryChipTextActive: { color: Theme.buttonDarkText },
  primaryBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontSize: 14, color: Theme.buttonDarkText, fontWeight: "700", textAlign: "center" },
  primaryBtnDisabled: { backgroundColor: Theme.textMuted, opacity: 0.7 },
  secondaryBtn: { minHeight: Layout.minTouchTargetSize, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { fontSize: 13, color: Theme.textMuted, fontWeight: "600" },
  errorText: { fontSize: 13, color: Theme.teslaRed },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.compliancePageBg },
  centeredInline: { alignItems: "center", gap: 8, paddingVertical: 12 },
  message: { fontSize: 13, color: Theme.textMuted, textAlign: "center" },
  previewWrap: { gap: 10 },
  errorBlock: { backgroundColor: Theme.complianceDocNeedBg, borderRadius: 10, padding: 12, gap: 4 },
  errorBlockTitle: { fontSize: 13, fontWeight: "700", color: Theme.teslaRed },
  errorRow: { fontSize: 12, color: Theme.complianceStageDocsFg, lineHeight: 18 },
  warning: { fontSize: 12, color: Theme.complianceStagePendingFg, lineHeight: 18 },
});
