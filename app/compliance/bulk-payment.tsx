/**
 * Bulk compliance payment import — Upload → Validate → Preview → Confirm →
 * Process. Every accepted row still posts through the canonical
 * `postCompliancePayment()` → `createLedgerEntry()` → `transactions` path
 * (see tripComplianceBulkPayment.service.ts) — this screen only handles
 * file I/O and the review UI, no direct ledger writes.
 */
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
// expo-file-system SDK 54 moved readAsStringAsync to the legacy entry (matches
// the existing convention in features/chat/utils/chatDocumentPick.util.ts).
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ROUTES } from "@/lib/routes";
import { useQueryClient } from "@tanstack/react-query";
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { syncFinanceComplianceCaches } from "@/lib/queries/syncFinanceComplianceCaches";
import { BulkOperationWorkspace, BulkPaymentAuditLog } from "@/features/bulkOperations/components/BulkOperationWorkspace";
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
type Intent = "update" | "post";

export default function ComplianceBulkPaymentScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const canViewFinance = canSurface("trip_compliance.finance.view");
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const orgCtx = useOptionalOrganization();
  const orgId = orgCtx?.currentOrganization?.id ?? "";

  const [category, setCategory] = useState<ComplianceLedgerCategory>("compliance_advance");
  const [intent, setIntent] = useState<Intent>("update");
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
  const [logVersion, setLogVersion] = useState(0);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;
  const { width } = useWindowDimensions();
  const wide = width >= 980;

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.COMPLIANCE as Parameters<typeof router.replace>[0]);
  }, [router]);

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
  if (!complianceEnabled || (!canManageFinance && !canViewFinance)) {
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

  const categoryLabel = category === "compliance_advance" ? "Advance" : "Balance";
  const intentLabel = intent === "update" ? "Update fields" : "Post payments";

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: contentTopInset }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: layout.scrollBottomPadding(24), paddingHorizontal: Layout.screenPaddingHorizontal },
      ]}
    >
      <View style={[styles.page, wide && styles.pageWide]}>
      <View style={styles.mainCol}>
      <TouchableOpacity
        onPress={goBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back to Compliance"
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <ChevronLeft size={16} color={Theme.textMuted} strokeWidth={2.2} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Compliance finance</Text>
          <Text style={styles.title}>Bulk Payment</Text>
          <Text style={styles.subtitle}>
            Update a posted payment or post new ones. The log follows the same Advance or Balance choice.
          </Text>
        </View>
        <View style={styles.heroMeta}>
          <Text style={styles.heroMetaLabel}>{categoryLabel}</Text>
          <Text style={styles.heroMetaValue}>{intentLabel}</Text>
        </View>
      </View>

      <View style={[styles.controlCard, wide && styles.controlCardWide]}>
        <View style={styles.controlBlock}>
          <Text style={styles.subheader}>Category</Text>
          <View style={styles.segment}>
            {(["compliance_advance", "compliance_balance"] as const).map((c) => {
              const on = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => {
                    setCategory(c);
                    reset();
                  }}
                  style={[styles.segmentItem, on && styles.segmentItemOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                    {c === "compliance_advance" ? "Advance" : "Balance"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.controlBlock}>
          <Text style={styles.subheader}>Action</Text>
          <View style={styles.segment}>
            {(
              [
                ["update", "Update fields"],
                ["post", "Post payments"],
              ] as const
            ).map(([id, label]) => {
              const on = intent === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setIntent(id)}
                  style={[styles.segmentItem, on && styles.segmentItemOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {intent === "update" ? (
        <BulkOperationWorkspace
          organizationId={orgId}
          category={category}
          grantedSurfaces={[
            ...(canViewFinance ? ["trip_compliance.finance.view"] : []),
            ...(canManageFinance ? ["trip_compliance.finance.manage"] : []),
          ]}
          onBatchSaved={() => setLogVersion((version) => version + 1)}
        />
      ) : null}

      {intent === "post" && !canManageFinance ? (
        <Text style={styles.message}>Posting new payments needs compliance finance manage access.</Text>
      ) : null}

      {intent === "post" && canManageFinance && step === "upload" ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={handlePick}>
          <Text style={styles.primaryBtnText}>Select CSV</Text>
        </TouchableOpacity>
      ) : null}
      {intent === "post" && loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {intent === "post" && step === "validating" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Validating {fileName}…</Text>
        </View>
      ) : null}

      {intent === "post" && step === "preview" ? (
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

      {intent === "post" && step === "confirm" ? (
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

      {intent === "post" && step === "processing" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Processing {valid.length} payments…</Text>
        </View>
      ) : null}

      {intent === "post" && step === "done" ? (
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
        </View>
      ) : null}

      </View>

      <View style={styles.sideCol}>
        <View style={styles.sideCard}>
          <Text style={styles.eyebrow}>How this runs</Text>
          {[
            ["1", "Choose Advance or Balance"],
            ["2", intent === "update" ? "Pick the fields, then upload the sheet" : "Upload the payment sheet"],
            ["3", "Review every row before anything is written"],
            ["4", "Confirm. Amount and mode stay as posted when you update fields."],
          ].map(([stepNo, copy]) => (
            <View key={stepNo} style={styles.stepRow}>
              <View style={styles.stepNo}>
                <Text style={styles.stepNoText}>{stepNo}</Text>
              </View>
              <Text style={styles.stepCopy}>{copy}</Text>
            </View>
          ))}
        </View>
        <View style={styles.sideCard}>
          <Text style={styles.subheader}>Update log</Text>
          <Text style={styles.sideHint}>{categoryLabel} files confirmed in this workspace.</Text>
          <BulkPaymentAuditLog organizationId={orgId} category={category} refreshKey={logVersion} canCorrect={canManageFinance} />
        </View>
      </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.compliancePageBg },
  content: { paddingTop: Layout.spacingMedium, gap: 16, maxWidth: 1180, width: "100%", alignSelf: "center" },
  page: { gap: 16 },
  pageWide: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  mainCol: { flex: 1.6, minWidth: 0, gap: 16 },
  sideCol: { flex: 1, minWidth: 280, gap: 16 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: Layout.minTouchTargetSize,
  },
  backText: { fontSize: 13, fontWeight: "600", color: Theme.textMuted },
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 18,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.complianceStageBalanceFg,
  },
  heroMeta: {
    minWidth: 132,
    borderRadius: 12,
    backgroundColor: Theme.complianceSelectedWash,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  heroMetaLabel: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  heroMetaValue: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  controlCard: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },
  controlCardWide: { flexDirection: "row" },
  controlBlock: { flex: 1, minWidth: 0, gap: 8 },
  sideCard: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sideHint: { fontSize: 12, color: Theme.textMuted, lineHeight: 17, marginTop: -6 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.complianceIconWash,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNoText: { fontSize: 12, fontWeight: "800", color: Theme.complianceStageBalanceFg },
  stepCopy: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, color: Theme.textPrimary, paddingTop: 2 },
  section: { gap: 8 },
  title: { fontSize: 26, fontWeight: "800", color: Theme.textPrimaryDark, lineHeight: 32 },
  subtitle: { fontSize: 13, color: Theme.textMuted, lineHeight: 18 },
  subheader: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary, letterSpacing: 0.2 },
  segment: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 12,
    backgroundColor: Theme.complianceSelectedWash,
  },
  segmentItem: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentItemOn: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  segmentText: { fontSize: 13, fontWeight: "700", color: Theme.textMuted, textAlign: "center" },
  segmentTextOn: { color: Theme.textPrimaryDark },
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
  previewWrap: {
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 16,
  },
  errorBlock: { backgroundColor: Theme.complianceDocNeedBg, borderRadius: 10, padding: 12, gap: 4 },
  errorBlockTitle: { fontSize: 13, fontWeight: "700", color: Theme.teslaRed },
  errorRow: { fontSize: 12, color: Theme.complianceStageDocsFg, lineHeight: 18 },
  warning: { fontSize: 12, color: Theme.complianceStagePendingFg, lineHeight: 18 },
});
