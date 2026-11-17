/**
 * Bulk compliance payment import — Upload → Validate → Preview → Confirm →
 * Process. Every accepted row still posts through the canonical
 * `postCompliancePayment()` → `createLedgerEntry()` → `transactions` path
 * (see tripComplianceBulkPayment.service.ts) — this screen only handles
 * file I/O and the review UI, no direct ledger writes.
 */
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
// expo-file-system SDK 54 moved readAsStringAsync to the legacy entry (matches
// the existing convention in features/chat/utils/chatDocumentPick.util.ts).
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
import { BulkOperationWorkspace, BulkPaymentAuditLog, BulkPaymentSteps } from "@/features/bulkOperations/components/BulkOperationWorkspace";
import { mappingIssues, suggestMapping, unmappedHeaders } from "@/features/bulkOperations/utils/bulkOperation.engine.util";
import type { ColumnMapping } from "@/features/bulkOperations/utils/bulkOperation.model";
import {
  compliancePostRowsFromSheet,
  explainBulkPaymentReadError,
  POST_PAYMENT_FIELDS,
  processComplianceBulkPayments,
  readCompliancePostSheet,
  validateComplianceBulkPayments,
  type ComplianceBulkRowValidation,
} from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { TripRow } from "@/features/trips/services/trips.service";

const POST_SAMPLE_ROWS = [
  ["Trip ID", "Amount", "Mode", "Date", "UTR", "Remarks"],
  ["TRP-1001", "9000", "UPI", "2026-09-08", "HDFC123456", "Loading advance"],
];
const POST_SAMPLE_CSV = POST_SAMPLE_ROWS.map((row) => row.join(",")).join("\n");
const POST_STEP_COPY = [
  "Choose Advance or Balance.",
  "Upload or paste the sheet, then match each column.",
  "Open the preview. We check the trip, amount, and mode.",
  "Confirm. Only eligible rows are posted.",
];

async function downloadText(name: string, text: string): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const path = `${FileSystem.cacheDirectory ?? ""}${name}`;
  await FileSystem.writeAsStringAsync(path, text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
}

async function downloadPostExcel(): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Trip ID, Amount, Mode (UPI BANK CASH CHEQUE FUEL_CARD FASTAG CREDIT), Date YYYY-MM-DD, UTR, Remarks"],
    ...POST_SAMPLE_ROWS,
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Payments");
  if (Platform.OS === "web") {
    XLSX.writeFile(book, "compliance-payment-post.xlsx");
    return;
  }
  const path = `${FileSystem.cacheDirectory ?? ""}compliance-payment-post.xlsx`;
  const base64 = XLSX.write(book, { type: "base64", bookType: "xlsx" }) as string;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
}

function asPostCsv(text: string): string {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const sample = lines.find((line) => line.trim() && !line.trim().startsWith("#")) ?? "";
  if (!sample.includes("\t") || sample.includes(",")) return text;
  return lines
    .map((line) => line.split("\t").map((cell) => {
      const value = cell.trim();
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
    }).join(","))
    .join("\n");
}

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
  const [postHeaders, setPostHeaders] = useState<string[]>([]);
  const [postMatrix, setPostMatrix] = useState<string[][]>([]);
  const [postRowIndexes, setPostRowIndexes] = useState<number[]>([]);
  const [postMapping, setPostMapping] = useState<ColumnMapping>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [postValidated, setPostValidated] = useState(false);
  const [postCheckError, setPostCheckError] = useState<string | null>(null);
  const [removePostFile, setRemovePostFile] = useState(false);
  const [logVersion, setLogVersion] = useState(0);
  const [updateProgress, setUpdateProgress] = useState({ activeStep: 1, nextLine: "Next: select the CSV. Nothing is checked until you open the preview." });
  const onUpdateProgress = useCallback((progress: { activeStep: number; nextLine: string }) => {
    setUpdateProgress((current) =>
      current.activeStep === progress.activeStep && current.nextLine === progress.nextLine ? current : progress,
    );
  }, []);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;
  const { width } = useWindowDimensions();
  const wide = width >= 1100;

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
    setPostHeaders([]);
    setPostMatrix([]);
    setPostRowIndexes([]);
    setPostMapping({});
    setPasteOpen(false);
    setPasteText("");
    setPostValidated(false);
    setPostCheckError(null);
    setRemovePostFile(false);
  }, []);

  const postRows = useMemo(
    () => compliancePostRowsFromSheet(postHeaders, postMatrix, postMapping, postRowIndexes),
    [postHeaders, postMatrix, postMapping, postRowIndexes],
  );
  const postIssues = useMemo(
    () => mappingIssues({ id: "post", version: "1", title: "Post", operation: "import", matchField: "tripId", fields: POST_PAYMENT_FIELDS }, postMapping),
    [postMapping],
  );
  const postIgnored = useMemo(() => unmappedHeaders(postHeaders, postMapping), [postHeaders, postMapping]);
  const pastePreview = useMemo(() => readCompliancePostSheet(asPostCsv(pasteText)), [pasteText]);

  const loadPostText = useCallback((name: string, text: string) => {
    const sheet = readCompliancePostSheet(asPostCsv(text));
    if (sheet.headers.length === 0 || sheet.rows.length === 0) {
      setPostHeaders([]);
      setPostMatrix([]);
      setPostRowIndexes([]);
      setPostMapping({});
      setLoadError("This file needs a header and at least one payment row. Lines that start with # are notes and are skipped.");
      setStep("upload");
      return false;
    }
    setFileName(name);
    setPostHeaders(sheet.headers);
    setPostMatrix(sheet.rows);
    setPostRowIndexes(sheet.rowIndexes);
    setPostMapping(suggestMapping(sheet.headers, POST_PAYMENT_FIELDS));
    setValid([]);
    setInvalid([]);
    setBlocked([]);
    setAlreadyPaid([]);
    setLoadError(null);
    setPostValidated(false);
    setPostCheckError(null);
    setStep("upload");
    return true;
  }, []);

  const handlePick = useCallback(async () => {
    setLoadError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    try {
      const text = await readUriAsText(asset.uri);
      loadPostText(asset.name ?? "payments.csv", text);
    } catch (e) {
      setLoadError(explainBulkPaymentReadError((e as Error).message));
      setStep("upload");
    }
  }, [loadPostText]);

  const openPostPreview = useCallback(() => {
    if (postRows.length === 0 || postIssues.length > 0) return;
    setValid([]);
    setInvalid([]);
    setBlocked([]);
    setAlreadyPaid([]);
    setEligibleTotal(0);
    setPostValidated(false);
    setPostCheckError(null);
    setLoadError(null);
    setStep("preview");
  }, [postRows.length, postIssues.length]);

  const validatePostRows = useCallback(async () => {
    if (postRows.length === 0 || postIssues.length > 0) return;
    setLoadError(null);
    setStep("validating");
    try {
      const result = await validateComplianceBulkPayments({ organizationId: orgId, category, rows: postRows });
      setValid(result.valid);
      setInvalid(result.invalid);
      setBlocked(result.blocked);
      setAlreadyPaid(result.alreadyPaid);
      setEligibleTotal(result.eligibleTotal);
      setTripsById(result.tripsById);
      setPostValidated(true);
      setPostCheckError(null);
      setStep("preview");
    } catch (e) {
      setPostValidated(false);
      setPostCheckError(explainBulkPaymentReadError((e as Error).message));
      setStep("preview");
    }
  }, [orgId, category, postRows, postIssues.length]);

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
  const postActive = step === "confirm" || step === "processing" || step === "done" ? 4 : step === "preview" || step === "validating" ? 3 : fileName ? 2 : 1;
  const postNext = !fileName
    ? "Next: download the sample or select a CSV."
    : step === "upload" || step === "validating"
      ? "Next: open the preview. Each row is checked before anything is posted."
      : step === "preview"
        ? valid.length > 0
          ? `Next: confirm ${valid.length} eligible ${valid.length === 1 ? "payment" : "payments"}.`
          : "Nothing will be posted. Fix the rows in the preview, or close it."
        : "Next: confirm. Only eligible rows are posted.";

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: contentTopInset }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: layout.scrollBottomPadding(24), paddingHorizontal: Layout.screenPaddingHorizontal },
      ]}
    >
      <View style={styles.page}>
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

      <View style={styles.controlCard}>
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

      <View style={[styles.workRow, !wide && styles.workStack]}>
      <View style={styles.workMain}>
      {intent === "update" ? (
        <BulkOperationWorkspace
          organizationId={orgId}
          category={category}
          grantedSurfaces={[
            ...(canViewFinance ? ["trip_compliance.finance.view"] : []),
            ...(canManageFinance ? ["trip_compliance.finance.manage"] : []),
          ]}
          onBatchSaved={() => setLogVersion((version) => version + 1)}
          onProgress={onUpdateProgress}
        />
      ) : null}

      {intent === "post" && !canManageFinance ? (
        <Text style={styles.message}>Posting new payments needs compliance finance manage access.</Text>
      ) : null}

      {intent === "post" && canManageFinance && step === "upload" ? (
        <View style={styles.postCard}>
          <Text style={styles.subheader}>Payment file</Text>
          <View style={styles.templateRow}>
            <TouchableOpacity style={styles.templateCard} onPress={() => void downloadText("compliance-payment-post.csv", POST_SAMPLE_CSV)}>
              <Text style={styles.templateLink}>CSV sample</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.templateCard} onPress={() => void downloadPostExcel()}>
              <Text style={styles.templateLink}>Excel sample</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sampleHint}>
            Match each column after you upload or paste. Mode is UPI, BANK, CASH, CHEQUE, FUEL_CARD, FASTAG, or CREDIT. Lines that start with # are notes.
          </Text>
          <View style={styles.fileDrop}>
            <TouchableOpacity style={styles.fileDropMain} onPress={handlePick} accessibilityRole="button">
              <Text style={styles.fileDropTitle}>{fileName || "Select CSV"}</Text>
              <Text style={styles.sampleHint}>
                {postRows.length > 0
                  ? `${postRows.length} payment ${postRows.length === 1 ? "row" : "rows"}`
                  : "One header row, then one payment per row."}
              </Text>
            </TouchableOpacity>
            {fileName ? (
              <TouchableOpacity
                style={styles.removeMark}
                onPress={() => setRemovePostFile(true)}
                accessibilityRole="button"
                accessibilityLabel="Remove file"
              >
                <Text style={styles.removeMarkText}>×</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => { setPasteText(""); setPasteOpen(true); }} accessibilityRole="button">
            <Text style={styles.templateLink}>Paste CSV</Text>
          </TouchableOpacity>
          {postHeaders.length > 0 ? (
            <View style={styles.matchPanel}>
              <Text style={styles.subheader}>Sample from the file</Text>
              <Text style={styles.sampleHint}>
                First {Math.min(4, postMatrix.length)} {Math.min(4, postMatrix.length) === 1 ? "row" : "rows"}, lined up with the columns below.
              </Text>
              <View style={styles.mapHead}>
                <View style={styles.mapLabelCol} />
                {postHeaders.map((header) => (
                  <View key={`sample-${header}`} style={styles.mapHeadCell}>
                    <Text style={styles.mapHeadText} numberOfLines={2}>{header}</Text>
                  </View>
                ))}
              </View>
              {postMatrix.slice(0, 4).map((cells, index) => (
                <View key={`sample-row-${index}`} style={styles.mapRow}>
                  <Text style={[styles.sampleIndex, styles.mapLabelCol]}>{index + 1}</Text>
                  {postHeaders.map((header, column) => (
                    <View key={`${index}-${header}`} style={styles.mapHeadCell}>
                      <Text style={styles.sampleValue} numberOfLines={2}>{cells[column] || "—"}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Text style={styles.subheader}>Match each field to a column</Text>
              <Text style={styles.sampleHint}>One mark per column. Tap a mark to give that column to the field.</Text>
              <View style={styles.mapHead}>
                <View style={styles.mapLabelCol} />
                {postHeaders.map((header) => (
                  <View key={header} style={styles.mapHeadCell}>
                    <Text style={styles.mapHeadText} numberOfLines={2}>{header}</Text>
                  </View>
                ))}
              </View>
              {POST_PAYMENT_FIELDS.map((field) => (
                <View key={field.key} style={styles.mapRow}>
                  <Text style={[styles.mapLabel, styles.mapLabelCol]} numberOfLines={1}>{field.label}</Text>
                  {postHeaders.map((header) => {
                    const on = postMapping[field.key] === header;
                    const taken = POST_PAYMENT_FIELDS.some((other) => other.key !== field.key && postMapping[other.key] === header);
                    return (
                      <TouchableOpacity
                        key={`${field.key}-${header}`}
                        style={styles.mapHeadCell}
                        accessibilityRole="button"
                        accessibilityLabel={`${field.label} uses ${header}`}
                        accessibilityState={{ selected: on }}
                        onPress={() => setPostMapping((current) => {
                          const next = { ...current };
                          if (next[field.key] === header) {
                            next[field.key] = null;
                            return next;
                          }
                          for (const key of Object.keys(next)) {
                            if (next[key] === header) next[key] = null;
                          }
                          next[field.key] = header;
                          return next;
                        })}
                      >
                        <View style={[styles.mapMark, on && styles.mapMarkOn, taken && !on && styles.mapMarkTaken]}>
                          {on ? <Text style={styles.mapMarkText}>✓</Text> : taken ? <View style={styles.mapMarkDot} /> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              {postIssues.length > 0 ? (
                <Text style={styles.errorRow}>{postIssues.map((issue) => issue.message).join(" ")}</Text>
              ) : null}
              {postIgnored.length > 0 ? <Text style={styles.sampleHint}>Not used: {postIgnored.join(", ")}</Text> : null}
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, (postRows.length === 0 || postIssues.length > 0) && styles.primaryBtnDisabled]}
            disabled={postRows.length === 0 || postIssues.length > 0}
            onPress={openPostPreview}
          >
            <Text style={styles.primaryBtnText}>Preview file</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {intent === "post" && step === "processing" ? (
        <View style={styles.centeredInline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.message}>Processing {valid.length} payments…</Text>
        </View>
      ) : null}

      {intent === "post" && (step === "preview" || step === "validating" || step === "confirm" || step === "done") ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => (step === "done" ? reset() : setStep("upload"))}
        >
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>File preview</Text>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {step === "done" ? "Payment batch" : step === "confirm" ? "Confirm payments" : fileName || "Payment file"}
                  </Text>
                  {step === "preview" || step === "validating" ? (
                    <Text style={styles.sampleHint}>{postMatrix.length} data {postMatrix.length === 1 ? "row" : "rows"} · {postHeaders.length} columns</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => (step === "done" ? reset() : setStep("upload"))}
                  style={styles.sheetClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close review"
                >
                  <Text style={styles.sheetCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
      {step === "preview" || step === "validating" ? (
        <View style={styles.previewWrap}>
          <Text style={styles.sampleHint}>Check the Trip ID against this workspace, then the amount, mode, date and UTR.</Text>
          <ScrollView horizontal>
            <View>
              <View style={styles.tableRow}>
                {postHeaders.map((header) => (
                  <Text key={header} style={styles.tableHead} numberOfLines={1}>{header}</Text>
                ))}
              </View>
              {postMatrix.slice(0, 30).map((cells, index) => (
                <View key={postRowIndexes[index] ?? index} style={styles.tableRow}>
                  {postHeaders.map((header, column) => (
                    <Text key={`${index}-${header}`} style={styles.tableCell} numberOfLines={1}>{cells[column] || "—"}</Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          {postMatrix.length > 30 ? <Text style={styles.sampleHint}>Showing the first 30 of {postMatrix.length} rows.</Text> : null}
          {step === "validating" ? (
            <View style={styles.centeredInline}>
              <ActivityIndicator color={Theme.textMuted} />
              <Text style={styles.message}>Checking {fileName}…</Text>
            </View>
          ) : null}
          {postValidated ? (
            <>
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
            </>
          ) : null}
          {postCheckError ? <Text style={styles.errorRow}>{postCheckError}</Text> : null}
          {step === "validating" ? null : postValidated && valid.length > 0 ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("confirm")}>
              <Text style={styles.primaryBtnText}>
                Review confirmation for {valid.length} trips (₹{eligibleTotal.toLocaleString("en-IN")})
              </Text>
            </TouchableOpacity>
          ) : postValidated ? (
            <Text style={styles.message}>No eligible rows to post.</Text>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void validatePostRows()}>
              <Text style={styles.primaryBtnText}>Validate rows</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setStep("upload")} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Close</Text>
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
        </View>
      ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal visible={pasteOpen} transparent animationType="fade" onRequestClose={() => setPasteOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Paste CSV</Text>
              <TouchableOpacity onPress={() => setPasteOpen(false)} accessibilityRole="button" accessibilityLabel="Close paste">
                <Text style={styles.sheetCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              <Text style={styles.sampleHint}>Paste a header row and one payment per row. Nothing is posted until you preview and confirm.</Text>
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={"Trip ID,Amount,Mode,Date,UTR,Remarks\nTRP-1001,9000,UPI,2026-09-08,HDFC123456,Loading advance"}
                placeholderTextColor={Theme.textMuted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.pasteInput}
              />
              {pastePreview.rows.length > 0 ? (
                <ScrollView horizontal>
                  <View>
                    <View style={styles.tableRow}>
                      {pastePreview.headers.map((header) => (
                        <Text key={header} style={styles.tableHead} numberOfLines={1}>{header}</Text>
                      ))}
                    </View>
                    {pastePreview.rows.slice(0, 12).map((cells, index) => (
                      <View key={index} style={styles.tableRow}>
                        {pastePreview.headers.map((header, column) => (
                          <Text key={`${index}-${header}`} style={styles.tableCell} numberOfLines={1}>{cells[column] || "—"}</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : pasteText.trim() ? (
                <Text style={styles.errorRow}>Add a header row and at least one data row.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.templateRow}>
              <TouchableOpacity style={styles.templateCard} onPress={() => setPasteOpen(false)}>
                <Text style={styles.sheetCloseText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, pastePreview.rows.length === 0 && styles.primaryBtnDisabled]}
                disabled={pastePreview.rows.length === 0}
                onPress={() => {
                  if (loadPostText("pasted.csv", pasteText)) {
                    setPasteOpen(false);
                    setPasteText("");
                  }
                }}
              >
                <Text style={styles.primaryBtnText}>Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(loadError)} transparent animationType="fade" onRequestClose={() => setLoadError(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.noticeCard}>
            <Text style={styles.sheetTitle}>This file can't be posted</Text>
            <Text style={styles.sampleHint}>{loadError}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setLoadError(null)}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={removePostFile} transparent animationType="fade" onRequestClose={() => setRemovePostFile(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.noticeCard}>
            <Text style={styles.sheetTitle}>Remove this file?</Text>
            <Text style={styles.sampleHint}>{fileName} will be cleared from this page. Payments already posted stay as they are.</Text>
            <View style={styles.templateRow}>
              <TouchableOpacity style={styles.templateCard} onPress={() => setRemovePostFile(false)}>
                <Text style={styles.sheetCloseText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
                <Text style={styles.primaryBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>

      <View style={[styles.sideColumn, !wide && styles.sideColumnFull]}>
        <BulkPaymentSteps
          activeStep={intent === "update" ? updateProgress.activeStep : postActive}
          nextLine={intent === "update" ? updateProgress.nextLine : postNext}
          copies={intent === "update" ? undefined : POST_STEP_COPY}
        />
        <View style={styles.logRail}>
          <Text style={styles.subheader}>Update log</Text>
          <Text style={styles.sideHint}>{categoryLabel} files confirmed in this workspace.</Text>
          <BulkPaymentAuditLog organizationId={orgId} category={category} refreshKey={logVersion} canCorrect={canManageFinance} />
        </View>
      </View>
      </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.compliancePageBg },
  content: { paddingTop: Layout.spacingMedium, gap: 16, width: "100%", maxWidth: 1480, alignSelf: "center" },
  page: { width: "100%", alignItems: "stretch", gap: 16 },
  workRow: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  workStack: { flexDirection: "column" },
  workMain: { flex: 1, minWidth: 0, gap: 16 },
  sideColumn: { width: 340, gap: 16, flexShrink: 0 },
  sideColumnFull: { width: "100%" },
  logRail: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  postCard: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  fileDrop: { position: "relative" },
  fileDropMain: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.complianceHoverBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 44,
    paddingVertical: 14,
    gap: 4,
  },
  fileDropTitle: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "center" },
  matchPanel: { gap: 8, marginTop: 4 },
  mapHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.complianceCardBorder,
  },
  mapHeadCell: { flex: 1, minWidth: 0, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  mapHeadText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, textAlign: "center" },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  mapLabelCol: { width: 132, minWidth: 132 },
  mapLabel: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  sampleIndex: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  sampleValue: { fontSize: 12, fontWeight: "600", color: Theme.textPrimary, textAlign: "center" },
  mapMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  mapMarkOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  mapMarkTaken: { backgroundColor: Theme.complianceIconWash },
  mapMarkText: { fontSize: 14, fontWeight: "700", color: Theme.buttonDarkText },
  mapMarkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.textMuted },
  pasteInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 10,
    padding: 10,
    color: Theme.textPrimary,
    fontSize: 13,
    textAlignVertical: "top",
  },
  removeMark: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  removeMarkText: { fontSize: 18, lineHeight: 20, fontWeight: "600", color: Theme.textPrimaryDark },
  noticeCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Theme.surfaceBorder },
  tableHead: { width: 120, paddingHorizontal: 8, paddingVertical: 8, fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  tableCell: { width: 120, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: Theme.textPrimaryDark },
  postUpload: { gap: 10 },
  templateRow: { flexDirection: "row", gap: 10 },
  templateCard: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  templateLink: { fontSize: 13, fontWeight: "700", color: Theme.complianceStageBalanceFg },
  sampleHint: { fontSize: 12, lineHeight: 17, color: Theme.textMuted },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "86%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    overflow: "hidden",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark },
  sheetClose: { minHeight: Layout.minTouchTargetSize, justifyContent: "center", paddingHorizontal: 8 },
  sheetCloseText: { fontSize: 13, fontWeight: "700", color: Theme.textMuted },
  stepStrip: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    overflow: "hidden",
  },
  stepCell: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Theme.complianceSelectedWash,
  },
  stepIndex: { fontSize: 11, fontWeight: "800", color: Theme.complianceStageBalanceFg },
  stepLabel: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { padding: 20, gap: 12 },
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
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 16,
  },
  controlBlock: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 8 },
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
  previewWrap: { gap: 12 },
  errorBlock: { backgroundColor: Theme.complianceDocNeedBg, borderRadius: 10, padding: 12, gap: 4 },
  errorBlockTitle: { fontSize: 13, fontWeight: "700", color: Theme.teslaRed },
  errorRow: { fontSize: 12, color: Theme.complianceStageDocsFg, lineHeight: 18 },
  warning: { fontSize: 12, color: Theme.complianceStagePendingFg, lineHeight: 18 },
});
