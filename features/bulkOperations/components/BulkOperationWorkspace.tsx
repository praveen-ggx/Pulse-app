/**
 * Shared bulk-operation workspace. Modules pass an adapter; this screen owns
 * template, mapping, preview, confirmation and history.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Calendar, Eye } from "lucide-react-native";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import {
  compliancePaymentBulkPermissions,
  paymentFieldTemplate,
  PAYMENT_UPDATE_FIELDS,
  previewPaymentFieldUpdate,
  type PaymentUpdateField,
} from "@/features/tripCompliance/paymentBulk/compliancePaymentField.adapter";
import {
  cellsForRow,
  bulkFileExceedsLimit,
  canPerformBulkAction,
  includedReadyCount,
  mappingIssues,
  parseBulkCsv,
  suggestMapping,
  templateCsv,
  unmappedHeaders,
} from "@/features/bulkOperations/utils/bulkOperation.engine.util";
import { spreadsheetToCsv } from "@/features/bulkOperations/utils/bulkSpreadsheet.util";
import type { BulkPreviewRow, ColumnMapping } from "@/features/bulkOperations/utils/bulkOperation.model";
import { resolveComplianceActorNames } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { listPostedCompliancePayments } from "@/features/tripCompliance/services/tripComplianceRead.service";
import {
  confirmPaymentFieldBatch,
  correctPaymentField,
  listBulkBatches,
  listBulkBatchMatchRows,
  loadBulkBatchDetail,
  type StoredBatch,
} from "@/features/bulkOperations/services/bulkHistory.service";
import {
  batchMatchesLogFilters,
  fieldUpdateLogEntry,
  findBulkFileForPayments,
  groupPostedPayments,
  mergePaymentLogs,
  mergeStoredPaymentLogs,
  PAYMENT_POST_ADAPTER_ID,
  previewRowMatchesFilters,
  readPendingPaymentLogs,
  type PaymentLogFilters,
  type PendingPaymentLog,
} from "@/features/bulkOperations/utils/bulkPaymentLog.util";

async function readUri(uri: string, name: string): Promise<string> {
  if (Platform.OS === "web") {
    const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
    return spreadsheetToCsv(name, bytes, "array");
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return spreadsheetToCsv(name, base64, "base64");
}

async function downloadTemplate(name: string, text: string): Promise<void> {
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

const TONE: Record<string, { fg: string; bg: string }> = {
  ready: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
  applied: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
  unchanged: { fg: Theme.textMuted, bg: Theme.cardWhite },
  corrected: { fg: Theme.complianceStageInfoFg, bg: Theme.complianceStageInfoBg },
  invalid: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
  duplicate: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
  blocked: { fg: Theme.complianceStagePendingFg, bg: Theme.complianceStagePendingBg },
  failed: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
  stale: { fg: Theme.complianceStagePendingFg, bg: Theme.complianceStagePendingBg },
};

function Tag({ label, tone }: { label: string; tone: string }) {
  const colors = TONE[tone] ?? TONE.unchanged;
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg }]}>
      <Text style={[styles.tagText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const STEP_COPY = [
  "Choose Advance or Balance, then the fields to change.",
  "Upload the CSV or Excel file. Use the template for the fields you selected.",
  "Open the preview. We check the Trip ID and the fields you selected.",
  "Confirm. Only rows that pass are updated.",
] as const;

export function BulkPaymentSteps({
  activeStep,
  nextLine,
  copies = STEP_COPY,
}: {
  activeStep: number;
  nextLine: string;
  copies?: readonly string[];
}) {
  const labels = ["Choose", "Upload", "Preview", "Confirm"] as const;
  return (
    <View style={styles.summaryPane}>
      <Text style={styles.sectionLabel}>Follow these steps</Text>
      {labels.map((label, index) => {
        const on = activeStep === index + 1;
        const done = activeStep > index + 1;
        return (
          <View key={label} style={styles.guideRow}>
            <View style={[styles.summaryStepNo, (on || done) && styles.summaryStepNoOn]}>
              <Text style={[styles.summaryStepNoText, (on || done) && styles.summaryStepNoTextOn]}>{index + 1}</Text>
            </View>
            <View style={styles.fileCopy}>
              <Text style={[styles.fieldName, !on && !done && styles.summaryStepLabel]}>{label}</Text>
              <Text style={styles.muted}>{copies[index]}</Text>
            </View>
          </View>
        );
      })}
      <Text style={styles.nextLine}>{nextLine}</Text>
    </View>
  );
}

export function BulkOperationWorkspace({
  organizationId,
  category,
  grantedSurfaces,
  onBatchSaved,
  onProgress,
}: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  grantedSurfaces: readonly string[];
  onBatchSaved?: (entry: PendingPaymentLog) => void;
  onProgress?: (progress: { activeStep: number; nextLine: string }) => void;
}) {
  const granted = useMemo(() => new Set(grantedSurfaces), [grantedSurfaces]);
  const canReview = canPerformBulkAction("review", compliancePaymentBulkPermissions, granted);
  const canExecute = canPerformBulkAction("execute", compliancePaymentBulkPermissions, granted);
  const [selection, setSelection] = useState<PaymentUpdateField[]>(["utr"]);
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rows, setRows] = useState<BulkPreviewRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();
  const sheetWidth = Math.min(760, Math.max(320, width - 48));
  const sheetHeight = Math.min(720, Math.max(420, height - 80));

  const template = useMemo(() => paymentFieldTemplate(selection), [selection]);
  const pasted = useMemo(() => parseBulkCsv(asCsv(pasteText)), [pasteText]);
  useEffect(() => {
    if (headers.length === 0) return;
    setMapping((current) => {
      const next = suggestMapping(headers, template.fields);
      const used = new Set(Object.values(next).filter((value): value is string => Boolean(value)));
      for (const field of template.fields) {
        const chosen = current[field.key];
        if (!chosen || !headers.includes(chosen) || used.has(chosen) || next[field.key]) continue;
        next[field.key] = chosen;
        used.add(chosen);
      }
      return next;
    });
  }, [headers, template]);
  const issues = useMemo(() => {
    const found = mappingIssues(template, mapping);
    if (headers.length > 0 && !mapping.tripId && !mapping.lrNumber) {
      found.push({ field: "reference", message: "Map a column to Trip ID or LR number." });
    }
    return found;
  }, [template, mapping, headers.length]);
  const ignored = useMemo(() => unmappedHeaders(headers, mapping), [headers, mapping]);
  const readyCount = includedReadyCount(rows);
  const blockedCount = rows.filter((row) => row.status !== "ready").length;
  const hasInvalid = rows.some((row) => row.status === "invalid");

  const loadSheet = useCallback((name: string, text: string) => {
    const bytes = new TextEncoder().encode(text).length;
    if (bulkFileExceedsLimit(bytes)) {
      setError("This file is over the 1 MB limit. Split it into smaller files. No payment was changed.");
      return false;
    }
    const sheet = parseBulkCsv(asCsv(text));
    if (sheet.headers.length === 0 || sheet.rows.length === 0) {
      setError("This needs a header row and at least one data row. No payment was changed.");
      return false;
    }
    const detected = PAYMENT_UPDATE_FIELDS.filter((field) =>
      Boolean(suggestMapping(sheet.headers, paymentFieldTemplate([field]).fields)[field]),
    );
    const nextSelection: PaymentUpdateField[] = detected.length > 0 ? [...detected] : ["utr"];
    setSelection(nextSelection);
    setFileName(name);
    setFileText(asCsv(text));
    setHeaders(sheet.headers);
    setMatrix(sheet.rows);
    setMapping(suggestMapping(sheet.headers, paymentFieldTemplate(nextSelection).fields));
    setRows([]);
    setPreviewOpen(false);
    setConfirmOpen(false);
    setError(null);
    setResult(null);
    return true;
  }, []);

  const pick = useCallback(async () => {
    setError(null);
    setResult(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "text/comma-separated-values",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "*/*",
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setBusy("Reading the file…");
    try {
      const text = await readUri(asset.uri, asset.name ?? "payments.csv");
      loadSheet(asset.name ?? "payments.csv", text);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }, [loadSheet]);

  const review = useCallback(async () => {
    if (!canReview) {
      setError("You can review bulk files with compliance finance view access.");
      return;
    }
    if (issues.length > 0) {
      setError(issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy("Checking every row against posted payments…");
    setError(null);
    try {
      const records = matrix.map((cells, index) => ({
        rowIndex: index + 2,
        ...cellsForRow(headers, cells, mapping, template.fields),
      })) as Array<Record<string, string> & { rowIndex: number }>;
      const preview = await previewPaymentFieldUpdate({
        organizationId,
        category,
        selection,
        records,
      });
      setRows(preview);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }, [canReview, issues, matrix, headers, mapping, template.fields, organizationId, category, selection]);

  const confirm = useCallback(async () => {
    if (rows.some((row) => row.status === "invalid")) {
      setError("Nothing was updated. An invalid Trip ID or LR number blocks the whole file.");
      setConfirmOpen(false);
      return;
    }
    if (includedReadyCount(rows) === 0) {
      setError(rows.find((row) => row.status !== "unchanged")?.message ?? "Nothing will be updated.");
      setConfirmOpen(false);
      return;
    }
    if (!canExecute) {
      setError("Confirming a payment update needs compliance finance manage access.");
      return;
    }
    setConfirmOpen(false);
    setBusy("Updating payments…");
    setError(null);
    const outcome = await confirmPaymentFieldBatch({
      organizationId,
      category,
      fileName,
      fileText,
      mapping,
      selection,
      rows,
    });
    setBusy(null);
    if (outcome.error) {
      setError(outcome.error.message);
      return;
    }
    const status = outcome.status;
    setResult(
      outcome.replayed
        ? "This file was already confirmed. It is listed in the update log."
        : status === "completed"
          ? `Updated. The file, time and user are in the update log.${keptAfter(selection) ? ` ${keptAfter(selection)}` : ""}`
          : status === "partial"
            ? "Some rows were not updated. Nothing else was retried. Open the update log for each row."
            : status === "failed"
              ? "No payment field was updated. The file is in the update log."
              : "The update did not finish. No further rows were retried.",
    );
    setRows([]);
    setPreviewOpen(false);
    onBatchSaved?.(fieldUpdateLogEntry({
      fileName,
      category,
      selection,
      status,
      batchId: outcome.batchId,
      rows: rows.filter((row) => row.included).map((row) => ({
        rowIndex: row.rowIndex,
        matchKey: row.matchKey,
        recordId: row.recordId,
        status: row.status,
        message: row.message,
        before: row.before,
        proposed: row.proposed,
      })),
    }));
  }, [canExecute, organizationId, category, fileName, fileText, mapping, selection, rows, onBatchSaved]);

  const fieldLabel = (field: PaymentUpdateField) =>
    field === "utr" ? "UTR" : field === "requestId" ? "Request ID" : field === "amount" ? "Amount" : field === "mode" ? "Mode" : "Transaction date";
  const fieldHint = (field: PaymentUpdateField) =>
    field === "utr" ? "Bank reference" : field === "requestId" ? "Internal request" : field === "amount" ? "Paid value" : field === "mode" ? "How it was paid" : "Settlement date";
  const keptNote = keptStay(selection);

  const activeStep = confirmOpen ? 4 : rows.length > 0 ? 3 : headers.length > 0 ? 2 : 1;
  const nextLine =
    headers.length === 0
      ? "Next: select the CSV or Excel file. Nothing is checked until you open the preview."
      : rows.length === 0
        ? "Next: open the file. Preview shows every cell, then checks each Trip ID."
          : hasInvalid
          ? "Nothing will be updated. An invalid Trip ID or LR number blocks the whole file."
          : confirmOpen
            ? `Next: confirm. Only ready rows are written. ${keptNote}`
            : `Next: confirm ${readyCount} ready ${readyCount === 1 ? "row" : "rows"}. You will see each change before it is written.`;

  useEffect(() => {
    onProgress?.({ activeStep, nextLine });
  }, [activeStep, nextLine, onProgress]);

  return (
    <View style={styles.stack}>
      <View style={styles.mainPane}>
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text style={styles.sectionLabel}>Fields to update</Text>
          <Text style={styles.fieldCount}>{selection.length} selected</Text>
        </View>
        <View style={styles.fieldGrid}>
          {PAYMENT_UPDATE_FIELDS.map((field) => {
            const on = selection.includes(field);
            return (
              <Pressable
                key={field}
                style={[styles.fieldTile, on && styles.fieldTileOn]}
                onPress={() =>
                  setSelection((current) => {
                    const next = on ? current.filter((item) => item !== field) : [...current, field];
                    return next.length === 0 ? current : next;
                  })
                }
              >
                <View style={[styles.fieldDot, on && styles.fieldDotOn]}>
                  {on ? <Text style={styles.fieldDotText}>✓</Text> : null}
                </View>
                <Text style={styles.fieldName}>{fieldLabel(field)}</Text>
                <Text style={styles.fieldHint}>{fieldHint(field)}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.templateRow}>
          <Pressable style={styles.templateCard} onPress={() => void downloadTemplate("compliance-payment-update.csv", templateCsv(template))}>
            <Text style={styles.templateKicker}>CSV</Text>
            <Text style={styles.templateTitle}>Template v{template.version}</Text>
          </Pressable>
          <Pressable
            style={styles.templateCard}
            onPress={async () => {
              const XLSX = await import("xlsx");
              const notes = template.fields.map((field) => `${field.label}: ${field.format}${field.required ? " (required)" : ""}`);
              const sheet = XLSX.utils.aoa_to_sheet([
                [`# ${template.id} ${template.version}`],
                [notes.join(" | ")],
                template.fields.map((field) => field.label),
                template.fields.map((field) => field.example),
              ]);
              const book = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(book, sheet, "Template");
              if (Platform.OS === "web") {
                XLSX.writeFile(book, "compliance-payment-update.xlsx");
                return;
              }
              const base64 = XLSX.write(book, { type: "base64", bookType: "xlsx" });
              const path = `${FileSystem.cacheDirectory ?? ""}compliance-payment-update.xlsx`;
              await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
              if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
            }}
          >
            <Text style={styles.templateKicker}>Excel</Text>
            <Text style={styles.templateTitle}>Template v{template.version}</Text>
          </Pressable>
        </View>
        <View style={styles.fileRow}>
        <View style={[styles.dropWrap, styles.dropFlex]}>
        <Pressable style={styles.drop} onPress={() => void pick()} disabled={!canReview}>
          <Text style={styles.dropTitle}>{fileName || (canReview ? "Select CSV or Excel" : "View access required")}</Text>
          <Text style={styles.dropHint}>
            {fileName ? `${matrix.length} data ${matrix.length === 1 ? "row" : "rows"}` : "One header row, then one row per payment."}
          </Text>
        </Pressable>
        {fileName ? (
          <Pressable
            style={styles.removeFile}
            onPress={() => setRemoveOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Remove file"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.removeFileMark}>×</Text>
          </Pressable>
        ) : null}
        </View>
        <Pressable
          style={styles.pasteCard}
          onPress={() => { setPasteText(""); setPasteOpen(true); }}
          disabled={!canReview}
          accessibilityRole="button"
        >
          <Text style={styles.templateKicker}>Or</Text>
          <Text style={styles.templateTitle}>Paste CSV</Text>
        </Pressable>
        </View>
      </View>
      <Modal visible={removeOpen} transparent animationType="fade" onRequestClose={() => setRemoveOpen(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.sheetTitle}>Remove this file?</Text>
            <Text style={styles.muted}>
              {fileName} will be cleared from this page. Payments already posted stay as they are.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setRemoveOpen(false)}>
                <Text style={styles.sheetCloseText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmProceed}
                onPress={() => {
                  setFileName("");
                  setFileText("");
                  setHeaders([]);
                  setMatrix([]);
                  setMapping({});
                  setRows([]);
                  setPreviewOpen(false);
                  setConfirmOpen(false);
                  setError(null);
                  setResult(null);
                  setRemoveOpen(false);
                }}
              >
                <Text style={styles.confirmProceedText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={pasteOpen} transparent animationType="fade" onRequestClose={() => setPasteOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { width: Math.min(920, sheetWidth + 160), maxHeight: sheetHeight }]}>
            <View style={styles.sheetHead}>
              <View style={styles.fileCopy}>
                <Text style={styles.kicker}>Paste</Text>
                <Text style={styles.sheetTitle}>Paste CSV</Text>
                <Text style={styles.muted}>Header on the first row. A spreadsheet paste is read as columns too.</Text>
              </View>
              <Pressable onPress={() => setPasteOpen(false)} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Cancel paste">
                <Text style={styles.sheetCloseText}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={"Trip ID,UTR\nTRP-1001,HDFC123456"}
                placeholderTextColor={Theme.textMuted}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.pasteInput, styles.pasteMono, Platform.OS === "web" ? { tabSize: 4 } : null]}
              />
              {pasteText.trim() && pasted.rows.length === 0 ? (
                <Text style={styles.error}>Add a header row and at least one data row.</Text>
              ) : null}
              {pasted.rows.length > 0 ? (
                <View style={styles.stack}>
                  <Text style={styles.muted}>
                    {pasted.rows.length} data {pasted.rows.length === 1 ? "row" : "rows"} · {pasted.headers.length} columns.
                    {" "}Will update {pasteFieldLabels(pasted.headers) || "UTR"}.
                    {" "}Nothing is written until you confirm the update.
                  </Text>
                  <ScrollView horizontal>
                    <View>
                      <View style={styles.tableRow}>
                        {pasted.headers.map((header, column) => (
                          <Text key={header} style={[styles.tableHead, styles.pasteCell, { width: pasteColumnWidth(header, pasted.rows, column) }]} numberOfLines={1}>{header}</Text>
                        ))}
                      </View>
                      {pasted.rows.slice(0, 12).map((cells, index) => (
                        <View key={index} style={styles.tableRow}>
                          {pasted.headers.map((header, column) => (
                            <Text key={`${index}-${header}`} style={[styles.tableCell, styles.pasteCell, { width: pasteColumnWidth(header, pasted.rows, column) }]} numberOfLines={1}>{cells[column] || "—"}</Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  {pasted.rows.length > 12 ? <Text style={styles.muted}>Showing the first 12 of {pasted.rows.length} rows.</Text> : null}
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.sheetFoot}>
              <View style={styles.footRow}>
                <Pressable style={styles.secondaryAction} onPress={() => setPasteOpen(false)}>
                  <Text style={styles.link}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primary, styles.footPrimary, pasted.rows.length === 0 && styles.disabled]}
                  disabled={pasted.rows.length === 0}
                  onPress={() => {
                    if (loadSheet("pasted.csv", pasteText)) {
                      setPasteOpen(false);
                      setPasteText("");
                    }
                  }}
                >
                  <Text style={styles.primaryText}>Proceed</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {busy ? (
        <View style={styles.inline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.muted}>{busy}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {headers.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Sample from the file</Text>
          <Text style={styles.muted}>First {Math.min(4, matrix.length)} {Math.min(4, matrix.length) === 1 ? "row" : "rows"}, lined up with the columns below.</Text>
          <View style={styles.mapHead}>
            <View style={styles.mapLabelCol} />
            {headers.map((header) => (
              <View key={`sample-${header}`} style={styles.mapHeadCell}>
                <Text style={styles.mapHeadText} numberOfLines={2}>{header}</Text>
              </View>
            ))}
          </View>
          {matrix.slice(0, 4).map((cells, index) => (
            <View key={`sample-row-${index}`} style={styles.mapRow}>
              <Text style={[styles.sampleIndex, styles.mapLabelCol]}>{index + 1}</Text>
              {headers.map((header, column) => (
                <View key={`${index}-${header}`} style={styles.mapHeadCell}>
                  <Text style={styles.sampleValue} numberOfLines={2}>{cells[column] || "—"}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.sectionLabel}>Match each field to a column</Text>
          <Text style={styles.muted}>One mark per column. Tap a mark to give that column to the field.</Text>
          <View style={styles.mapHead}>
            <View style={styles.mapLabelCol} />
            {headers.map((header) => (
              <View key={header} style={styles.mapHeadCell}>
                <Text style={styles.mapHeadText} numberOfLines={2}>{header}</Text>
              </View>
            ))}
          </View>
          {template.fields.map((field) => (
            <View key={field.key} style={styles.mapRow}>
              <Text style={[styles.mapLabel, styles.mapLabelCol]} numberOfLines={1}>{field.label}</Text>
              {headers.map((header) => {
                const on = mapping[field.key] === header;
                const taken = template.fields.some((other) => other.key !== field.key && mapping[other.key] === header);
                return (
                  <Pressable
                    key={`${field.key}-${header}`}
                    style={styles.mapHeadCell}
                    accessibilityRole="button"
                    accessibilityLabel={`${field.label} uses ${header}`}
                    accessibilityState={{ selected: on }}
                    onPress={() => setMapping((current) => {
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
                  </Pressable>
                );
              })}
            </View>
          ))}
          {issues.length > 0 ? (
            <Text style={styles.error}>
              {unmappedHeaders(headers, mapping).length === 0
                ? `This file has no column for ${issues.map((issue) => template.fields.find((field) => field.key === issue.field)?.label ?? issue.field).join(" or ")}. Turn ${issues.length === 1 ? "that field" : "those fields"} off, or upload a file that includes ${issues.length === 1 ? "it" : "them"}.`
                : issues.map((issue) => issue.message).join(" ")}
            </Text>
          ) : null}
          {ignored.length > 0 ? <Text style={styles.muted}>Not used: {ignored.join(", ")}</Text> : null}
        </View>
      ) : null}

      <View style={styles.nextBar}>
        <Pressable
          style={[styles.primary, (headers.length === 0 || issues.length > 0) && styles.disabled]}
          disabled={headers.length === 0 || issues.length > 0}
          onPress={() => setPreviewOpen(true)}
        >
          <Text style={styles.primaryText}>{rows.length > 0 ? "Open validation" : "Preview file"}</Text>
        </Pressable>
      </View>

      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => { setPreviewOpen(false); setConfirmOpen(false); }}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { width: Math.min(920, sheetWidth + 160), maxHeight: sheetHeight }]}>
            <View style={styles.sheetHead}>
              <View style={styles.fileCopy}>
                <Text style={styles.kicker}>File preview</Text>
                <Text style={styles.sheetTitle} numberOfLines={1}>{fileName || "Payment file"}</Text>
                <Text style={styles.muted}>{matrix.length} data {matrix.length === 1 ? "row" : "rows"} · {headers.length} columns</Text>
              </View>
              <Pressable onPress={() => { setPreviewOpen(false); setConfirmOpen(false); }} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Close preview">
                <Text style={styles.sheetCloseText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              <Text style={styles.muted}>
                Match each row by Trip ID or LR number, then check the fields you selected.
              </Text>
              <ScrollView horizontal>
                <View>
                  <View style={styles.tableRow}>
                    {headers.map((header) => (
                      <Text key={header} style={styles.tableHead} numberOfLines={1}>{header}</Text>
                    ))}
                  </View>
                  {matrix.slice(0, 30).map((cells, index) => (
                    <View key={index} style={styles.tableRow}>
                      {headers.map((header, column) => (
                        <Text key={`${index}-${header}`} style={styles.tableCell} numberOfLines={1}>{cells[column] || "—"}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
              {matrix.length > 30 ? <Text style={styles.muted}>Showing the first 30 of {matrix.length} rows.</Text> : null}

              {rows.length > 0 ? (
                <View style={styles.stack}>
                  <Text style={styles.sectionLabel}>{hasInvalid || readyCount === 0 ? "Nothing will be updated" : "This will be updated"}</Text>
                  <Text style={styles.muted}>
                    {hasInvalid
                      ? "An invalid Trip ID or LR number blocks the whole file. Fix the file and preview it again."
                      : readyCount === 0
                        ? "No posted payment matched these rows. Close this preview, or use Post payments to record a new UTR."
                        : `${readyCount} matching ${readyCount === 1 ? "payment" : "payments"}. ${keptNote}`}
                  </Text>
                  {rows.map((row) => {
                    const tone = TONE[row.status] ?? TONE.unchanged;
                    const matched = row.status === "ready";
                    return (
                      <View key={row.rowIndex} style={[styles.previewRow, { borderLeftColor: tone.fg }]}>
                        <View style={styles.rowTop}>
                          <Text style={styles.title}>{row.matchKey || `Row ${row.rowIndex}`}</Text>
                          <Tag label={matched ? "will update" : row.status} tone={row.status} />
                        </View>
                        <Text style={styles.muted}>{row.message}</Text>
                        {matched ? selection.map((field) => (
                          <View key={field} style={styles.diffCols}>
                            <View style={styles.diffCol}>
                              <Text style={styles.diffKicker}>Now · {fieldLabel(field)}</Text>
                              <Text style={styles.diffValue}>{row.before[field] || "—"}</Text>
                            </View>
                            <View style={styles.diffCol}>
                              <Text style={styles.diffKicker}>After</Text>
                              <Text style={styles.diffValue}>{row.proposed[field] || "—"}</Text>
                            </View>
                          </View>
                        )) : null}
                        {matched && (row.preserved.amount != null || row.preserved.mode != null) ? (
                          <Text style={styles.kept}>
                            Kept
                            {row.preserved.amount != null ? ` · amount ${row.preserved.amount || "—"}` : ""}
                            {row.preserved.mode != null ? ` · mode ${row.preserved.mode || "—"}` : ""}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {confirmOpen && !hasInvalid && readyCount > 0 ? (
                <Text style={styles.muted}>Proceed writes only these changes. Back returns to this preview. Close leaves the file unchanged.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.sheetFoot}>
              {rows.length === 0 ? (
                <Pressable
                  style={[styles.primary, issues.length > 0 && styles.disabled]}
                  disabled={issues.length > 0}
                  onPress={() => void review()}
                >
                  <Text style={styles.primaryText}>Validate rows</Text>
                </Pressable>
              ) : hasInvalid ? (
                <Pressable style={styles.secondaryAction} onPress={() => { setPreviewOpen(false); setConfirmOpen(false); }}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              ) : readyCount === 0 ? (
                <Pressable style={styles.secondaryAction} onPress={() => { setPreviewOpen(false); setConfirmOpen(false); }}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              ) : confirmOpen ? (
                <View style={styles.footRow}>
                  <Pressable style={styles.secondaryAction} onPress={() => { setPreviewOpen(false); setConfirmOpen(false); }}>
                    <Text style={styles.link}>Close</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryAction} onPress={() => setConfirmOpen(false)}>
                    <Text style={styles.link}>Back</Text>
                  </Pressable>
                  <Pressable style={[styles.primary, styles.footPrimary, !canExecute && styles.disabled]} disabled={!canExecute} onPress={() => void confirm()}>
                    <Text style={styles.primaryText}>Proceed</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={[styles.primary, !canExecute && styles.disabled]} disabled={!canExecute} onPress={() => setConfirmOpen(true)}>
                  <Text style={styles.primaryText}>Confirm this update</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {result ? <Text style={styles.muted}>{result}</Text> : null}
      </View>
    </View>
  );
}


function pasteFieldLabels(headers: string[]): string {
  const labels: string[] = [];
  for (const header of headers) {
    const field = PAYMENT_UPDATE_FIELDS.find((item) => suggestMapping([header], paymentFieldTemplate([item]).fields)[item]);
    const label = field ? paymentFieldTemplate([field]).fields.find((item) => item.key === field)?.label : null;
    if (label) labels.push(label);
  }
  return labels.join(", ");
}

function pasteColumnWidth(header: string, rows: string[][], column: number): number {
  const samples = [header, ...rows.slice(0, 12).map((cells) => cells[column] ?? "")];
  const longest = samples.reduce((max, value) => Math.max(max, value.trim().length), 0);
  return Math.min(240, Math.max(96, longest * 8 + 24));
}

function asCsv(text: string): string {
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

function proposedOf(row: Record<string, unknown>): Record<string, string> {
  return (row.proposed_values ?? {}) as Record<string, string>;
}

function supplierNames(batch: StoredBatch, rows: Array<Record<string, unknown>>): string[] {
  const names: string[] = [];
  const summaryName = String((batch.summary as { supplier?: string }).supplier ?? "").trim();
  if (summaryName) names.push(summaryName);
  for (const row of rows) {
    const name = String(proposedOf(row).supplier ?? "").trim();
    if (name && !names.some((item) => item.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function supplierHeadline(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

function uniqueSupplierNames(names: string[]): string[] {
  const kept: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed && !kept.some((item) => item.toLowerCase() === trimmed.toLowerCase())) kept.push(trimmed);
  }
  return kept.sort((left, right) => left.localeCompare(right, "en"));
}

function PaymentPartyMark({
  name,
  size = 36,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
}: {
  name: string;
  size?: number;
  avatarUrl?: string;
  avatarSeed?: string;
  organizationImageUrl?: string;
  organizationAvatarSeed?: string;
}) {
  const label = name.trim() || "Supplier";
  return (
    <PartyAvatar
      name={label}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      organizationImageUrl={organizationImageUrl}
      organizationAvatarSeed={organizationAvatarSeed}
      initialsColorSeed={organizationAvatarSeed || avatarSeed || label}
      entityType="supplier"
      isIntegrated={(organizationImageUrl ?? "").trim() || (organizationAvatarSeed ?? "").trim() ? true : undefined}
      size={size}
      shape="circle"
    />
  );
}

function SinglePaymentPreview({
  supplier,
  amount,
  facts,
  postedBy,
  when,
  statusLabel,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  onClose,
}: {
  supplier: string;
  amount: string;
  facts: Array<{ label: string; value: string }>;
  postedBy: string;
  when: string;
  statusLabel: string;
  avatarUrl?: string;
  avatarSeed?: string;
  organizationImageUrl?: string;
  organizationAvatarSeed?: string;
  onClose: () => void;
}) {
  const name = supplier || "Payment";
  return (
    <View style={styles.payCard}>
      <View style={styles.payHero}>
        <PaymentPartyMark name={name} size={56} avatarUrl={avatarUrl} avatarSeed={avatarSeed} organizationImageUrl={organizationImageUrl} organizationAvatarSeed={organizationAvatarSeed} />
        <View style={styles.fileCopy}>
          <Text style={styles.payKicker}>Supplier</Text>
          <Text style={styles.payName} numberOfLines={2}>{name}</Text>
          <Text style={styles.payMeta} numberOfLines={2}>Posted by {postedBy} · {when}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Close preview">
          <Text style={styles.sheetCloseText}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.payAmountRow}>
        <View style={styles.fileCopy}>
          <Text style={styles.payKicker}>Amount</Text>
          <Text style={styles.payAmount} numberOfLines={1}>{amount || "—"}</Text>
        </View>
        <Tag label={statusLabel} tone={statusLabel === "Posted" ? "applied" : "failed"} />
      </View>
      <View style={styles.payFacts}>
        {facts.map((fact) => (
          <View key={fact.label} style={styles.payFact}>
            <Text style={styles.payKicker}>{fact.label}</Text>
            <Text style={styles.payFactValue} numberOfLines={2}>{fact.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function categoryOf(batch: StoredBatch): ComplianceLedgerCategory {
  const value = (batch.summary as { category?: string } | null)?.category;
  return value === "compliance_balance" ? "compliance_balance" : "compliance_advance";
}

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function isoDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function dayLabel(value: string, fallback: string): string {
  const iso = isoDay(value);
  if (!iso) return fallback;
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const CALENDAR_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CALENDAR_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let index = 0; index < first; index += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

function LogCalendar({
  year,
  month,
  from,
  to,
  onPrev,
  onNext,
  onPick,
}: {
  year: number;
  month: number;
  from: string;
  to: string;
  onPrev: () => void;
  onNext: () => void;
  onPick: (iso: string) => void;
}) {
  const start = from && to && from > to ? to : from;
  const end = from && to && from > to ? from : to;
  return (
    <View style={styles.calendar}>
      <View style={styles.calendarHead}>
        <Pressable onPress={onPrev} style={styles.calendarNav} accessibilityRole="button" accessibilityLabel="Previous month">
          <Text style={styles.calendarNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calendarTitle}>{CALENDAR_MONTHS[month]} {year}</Text>
        <Pressable onPress={onNext} style={styles.calendarNav} accessibilityRole="button" accessibilityLabel="Next month">
          <Text style={styles.calendarNavText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calendarWeek}>
        {CALENDAR_DAYS.map((day) => (
          <Text key={day} style={styles.calendarWeekday}>{day}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {monthCells(year, month).map((iso, index) => {
          if (!iso) return <View key={`empty-${index}`} style={styles.calendarDay} />;
          const selected = iso === from || iso === to;
          const inside = Boolean(start && end && iso > start && iso < end);
          return (
            <Pressable
              key={iso}
              onPress={() => onPick(iso)}
              style={[styles.calendarDay, inside && styles.calendarDayInside, selected && styles.calendarDayOn]}
              accessibilityRole="button"
              accessibilityLabel={dayLabel(iso, iso)}
            >
              <Text style={[styles.calendarDayText, selected && styles.calendarDayTextOn]}>{Number(iso.slice(8))}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LogFilters({
  filters,
  suppliers,
  onChange,
}: {
  filters: PaymentLogFilters;
  suppliers: string[];
  onChange: (next: PaymentLogFilters) => void;
}) {
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const openOn = isoDay(picking === "to" ? filters.to : filters.from) || isoDay(filters.from) || isoDay(filters.to);
  const opened = openOn ? new Date(`${openOn}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState({ year: opened.getFullYear(), month: opened.getMonth() });
  const showMonth = (key: "from" | "to") => {
    const iso = isoDay(filters[key]) || isoDay(filters.from) || isoDay(filters.to);
    const date = iso ? new Date(`${iso}T12:00:00`) : new Date();
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
    setPicking((current) => (current === key ? null : key));
  };
  const setDay = (key: "from" | "to", value: string) => {
    const next = { ...filters, [key]: isoDay(value) };
    if (next.from && next.to && next.from > next.to) {
      if (key === "from") next.to = next.from;
      else next.from = next.to;
    }
    onChange(next);
    setPicking(null);
  };
  const shiftMonth = (step: number) => {
    const date = new Date(cursor.year, cursor.month + step, 1);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
  };
  const active = Boolean(filters.from || filters.to || filters.supplier);
  return (
    <View style={styles.filterBlock}>
      <View style={styles.filterRow}>
        {(["from", "to"] as const).map((key) => {
          const label = key === "from" ? "From" : "To";
          const value = filters[key];
          return (
            <Pressable
              key={key}
              style={[styles.filterInput, styles.dateShell, styles.dateField, picking === key && styles.dateShellOn]}
              onPress={() => showMonth(key)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={[styles.dateValue, !value && styles.datePlaceholder]} numberOfLines={1}>{dayLabel(value, label)}</Text>
              <Calendar size={14} color={Theme.textMuted} strokeWidth={2.2} />
            </Pressable>
          );
        })}
      </View>
      {picking ? (
        <LogCalendar
          year={cursor.year}
          month={cursor.month}
          from={isoDay(filters.from)}
          to={isoDay(filters.to)}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          onPick={(iso) => setDay(picking, iso)}
        />
      ) : null}
      {suppliers.length > 0 ? (
        <View style={styles.chipWrap}>
          {["", ...suppliers].map((name) => {
            const selected = (filters.supplier || "") === name;
            return (
              <Pressable
                key={name || "all"}
                onPress={() => onChange({ ...filters, supplier: name })}
                style={[styles.chip, selected && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={name ? `Supplier ${name}` : "All suppliers"}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]} numberOfLines={1}>{name || "All"}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {active ? (
        <Pressable onPress={() => onChange({ from: "", to: "", supplier: "" })} accessibilityRole="button" accessibilityLabel="Clear filters">
          <Text style={styles.link}>Clear filters</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BulkPaymentAuditLog({
  organizationId,
  category,
  refreshKey,
  canCorrect,
  pending = [],
  variant,
}: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  refreshKey: number;
  canCorrect: boolean;
  pending?: PendingPaymentLog[];
  variant: "bulk" | "manual";
}) {
  const [batches, setBatches] = useState<StoredBatch[]>([]);
  const [postedLogs, setPostedLogs] = useState<PendingPaymentLog[]>([]);
  const [bulkFiles, setBulkFiles] = useState<PendingPaymentLog[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [postCursor, setPostCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [previewBatch, setPreviewBatch] = useState<StoredBatch | null>(null);
  const [previewReturn, setPreviewReturn] = useState<PendingPaymentLog | null>(null);
  const [detail, setDetail] = useState<{ rows: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [filters, setFilters] = useState<PaymentLogFilters>({ from: "", to: "", supplier: "" });
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [updates, posts, posted] = await Promise.all([
        variant === "bulk" ? listBulkBatches({ organizationId, adapterId: "compliance-payment-field-update", limit: 40 }) : Promise.resolve({ batches: [], error: null }),
        variant === "bulk" ? listBulkBatches({ organizationId, adapterId: PAYMENT_POST_ADAPTER_ID, limit: 40 }) : Promise.resolve({ batches: [], error: null }),
        variant === "manual" ? listPostedCompliancePayments({ organizationId, category, limit: 40 }) : Promise.resolve({ payments: [], hasMore: false, error: null }),
      ]);
      if (cancelled) return;
      const error = updates.error ?? posts.error ?? posted.error;
      if (error) setNote(error.message);
      else setNote(null);
      const server = [...updates.batches, ...posts.batches].filter((batch) => categoryOf(batch) === category);
      const grouped = groupPostedPayments(posted.payments, category);
      setBatches(server);
      setPostedLogs(grouped);
      setHasMorePosts(posted.hasMore);
      if (variant === "manual") {
        const [fileUpdates, filePosts] = await Promise.all([
          listBulkBatches({ organizationId, adapterId: "compliance-payment-field-update", limit: 40 }),
          listBulkBatches({ organizationId, adapterId: PAYMENT_POST_ADAPTER_ID, limit: 40 }),
        ]);
        if (cancelled) return;
        const files = [...fileUpdates.batches, ...filePosts.batches].filter((batch) => categoryOf(batch) === category);
        const matched = await listBulkBatchMatchRows(files.map((batch) => batch.id));
        if (cancelled) return;
        const withRows = mergePaymentLogs(files, pending).map((item) => {
          if (item.rows.length > 0) return item;
          const rows = matched.rows.filter((row) => String(row.batch_id ?? "") === item.batch.id);
          return rows.length > 0 ? { ...item, rows } : item;
        });
        setBulkFiles(withRows);
      } else {
        setBulkFiles([]);
      }
      const last = posted.payments[posted.payments.length - 1];
      setPostCursor(last ? { createdAt: last.createdAt, id: last.id } : null);
      const ids = [...server, ...grouped.map((item) => item.batch)].flatMap((batch) => [batch.uploaded_by, batch.confirmed_by]);
      const resolved = await resolveComplianceActorNames(ids, organizationId);
      if (!cancelled) setNames(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, category, refreshKey, pending, variant]);

  const openFile = async (file: PendingPaymentLog, returnTo: PendingPaymentLog | null) => {
    setPreviewReturn(returnTo);
    setPreviewBatch(file.batch);
    setCorrection("");
    if (file.rows.length > 0) {
      setDetail({ rows: file.rows, events: [] });
      setPreviewBusy(false);
      return;
    }
    setDetail(null);
    setPreviewBusy(true);
    const loaded = await loadBulkBatchDetail(file.batch.id);
    setPreviewBusy(false);
    if (loaded.error) setNote(loaded.error.message);
    else setDetail({ rows: loaded.rows, events: loaded.events });
  };

  const openPreview = async (batch: StoredBatch) => {
    setPreviewReturn(null);
    setPreviewBatch(batch);
    setDetail(null);
    setCorrection("");
    const local = [...pending, ...postedLogs, ...bulkFiles].find((item) => item.batch.id === batch.id && item.rows.length > 0);
    if (local) {
      setDetail({ rows: local.rows, events: [] });
      setPreviewBusy(false);
      return;
    }
    setPreviewBusy(true);
    const loaded = await loadBulkBatchDetail(batch.id);
    setPreviewBusy(false);
    if (loaded.error) setNote(loaded.error.message);
    else setDetail({ rows: loaded.rows, events: loaded.events });
  };

  const categoryLabel = category === "compliance_advance" ? "Advance" : "Balance";
  const actionLabel = (batch: StoredBatch) => {
    const summary = batch.summary as { kind?: string; posted?: number; failed?: number; reason?: string; amount?: number };
    if (batch.adapter_id === PAYMENT_POST_ADAPTER_ID || summary.kind === "post") {
      const posted = Number(summary.posted ?? 0);
      const failed = Number(summary.failed ?? 0);
      const money = Number(summary.amount ?? 0) > 0 ? ` · ₹${Number(summary.amount).toLocaleString("en-IN")}` : "";
      if (posted > 0 && failed === 0) return `Posted ${posted} ${posted === 1 ? "payment" : "payments"}${money}`;
      if (posted === 0 && failed === 1) return summary.reason ? `Not posted. ${summary.reason}` : "Payment was not posted";
      if (posted === 0) return `${failed} payments were not posted`;
      return `Posted ${posted}. Not posted ${failed}.`;
    }
    const fields = batch.field_selection?.length ? batch.field_selection.join(", ") : "selected fields";
    if (batch.status === "completed") return `Updated ${fields}`;
    if (batch.status === "partial") return `Partly updated ${fields}`;
    if (batch.status === "failed") return "Update did not finish";
    return `Confirmed ${fields}`;
  };

  const storedFiles = variant === "bulk" ? readPendingPaymentLogs(organizationId, category) : [];
  const sourceLogs = variant === "manual" ? postedLogs : mergePaymentLogs(batches, mergeStoredPaymentLogs(pending, storedFiles));
  const shownLogs = sourceLogs.filter((item) => batchMatchesLogFilters(item.batch, item.rows, filters));
  const shown = shownLogs.map((item) => item.batch);
  const loadOlder = async () => {
    if (!postCursor || loadingMore) return;
    setLoadingMore(true);
    const older = await listPostedCompliancePayments({ organizationId, category, limit: 40, before: postCursor });
    setLoadingMore(false);
    if (older.error) {
      setNote(older.error.message);
      return;
    }
    setPostedLogs((current) => [...current, ...groupPostedPayments(older.payments, category)]);
    setHasMorePosts(older.hasMore);
    const last = older.payments[older.payments.length - 1];
    setPostCursor(last ? { createdAt: last.createdAt, id: last.id } : null);
  };

  const previewSourceRows = detail?.rows ?? [];
  const showPreviewFilters = previewSourceRows.length > 1;
  const previewRows = showPreviewFilters
    ? previewSourceRows.filter((row) => previewRowMatchesFilters(row, filters))
    : previewSourceRows;
  const singleBatchFile = !showPreviewFilters && previewReturn == null && previewBatch && variant === "manual"
    ? findBulkFileForPayments({ batch: previewBatch, rows: previewSourceRows }, bulkFiles)
    : null;
  const postedPreview = Boolean(
    previewBatch && (previewBatch.adapter_id === PAYMENT_POST_ADAPTER_ID || (previewBatch.summary as { kind?: string }).kind === "post"),
  );
  const singlePayment = postedPreview && !showPreviewFilters && !previewBusy && previewRows.length === 1 ? previewRows[0] : null;

  return (
    <View style={styles.stack}>
      <LogFilters
        filters={filters}
        suppliers={uniqueSupplierNames(sourceLogs.flatMap((item) => supplierNames(item.batch, item.rows)))}
        onChange={setFilters}
      />
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      {shown.length === 0 ? (
        <Text style={styles.muted}>
          {variant === "bulk"
            ? (sourceLogs.length === 0 ? "No saved bulk file yet. Earlier payments stay in the payment log." : "No bulk file in this date or supplier.")
            : `No one-by-one ${categoryLabel.toLowerCase()} payments in this range.`}
        </Text>
      ) : null}
      {shownLogs.map((item) => {
        const batch = item.batch;
        const summary = batch.summary as { actorName?: string };
        const who = names[batch.confirmed_by ?? ""] || names[batch.uploaded_by ?? ""] || summary.actorName || "You";
        const suppliers = supplierNames(batch, item.rows);
        const supplier = supplierHeadline(suppliers);
        const headline = variant === "manual" && supplier ? supplier : who;
        const mark = proposedOf(item.rows[0] ?? {});
        const bulkFile = variant === "manual" ? findBulkFileForPayments(item, bulkFiles) : null;
        return (
          <View key={batch.id} style={styles.logItem}>
            <View style={styles.logHead}>
              <PaymentPartyMark name={headline} avatarUrl={mark.supplierAvatarUrl} avatarSeed={mark.supplierAvatarSeed} organizationImageUrl={mark.supplierOrganizationImageUrl} organizationAvatarSeed={mark.supplierOrganizationAvatarSeed} />
              <View style={styles.fileCopy}>
                <Text style={styles.logName} numberOfLines={1}>{headline}</Text>
                <Text style={styles.logAction} numberOfLines={2}>{actionLabel(batch)}</Text>
                <Text style={styles.logFile} numberOfLines={1}>{batch.file_name}</Text>
                <Text style={styles.logTime} numberOfLines={2}>
                  {variant === "manual" && supplier ? `Posted by ${who} · ` : ""}
                  {stamp(batch.created_at)} · {categoryLabel}
                </Text>
              </View>
              <Pressable
                style={styles.eyeButton}
                onPress={() => void openPreview(batch)}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${batch.file_name}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Eye size={15} color={Theme.complianceStageBalanceFg} strokeWidth={2.2} />
              </Pressable>
            </View>
            {bulkFile ? (
              <Pressable
                style={[styles.batchLink, styles.batchLinkIndent]}
                onPress={() => void openFile(bulkFile, item)}
                accessibilityRole="button"
                accessibilityLabel={`Open batch file ${bulkFile.batch.file_name}`}
              >
                <Text style={styles.batchLinkText} numberOfLines={1}>Batch payment · {bulkFile.batch.file_name}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {hasMorePosts ? (
        <Pressable onPress={() => void loadOlder()} accessibilityRole="button" accessibilityLabel="Show older payments">
          <Text style={styles.link}>{loadingMore ? "Loading…" : "Show older payments"}</Text>
        </Pressable>
      ) : null}
      <Modal visible={previewBatch != null} transparent animationType="none" onRequestClose={() => { setPreviewBatch(null); setPreviewReturn(null); }}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { width: Math.min(singlePayment ? 460 : 760, Math.max(320, width - 48)), maxHeight: Math.min(720, Math.max(420, height - 80)) }]}>
            {previewBatch == null ? null : singlePayment ? (
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.payBody}>
                <SinglePaymentPreview
                  supplier={String(((singlePayment.proposed_values ?? {}) as Record<string, string>).supplier ?? "").trim()}
                  amount={String(((singlePayment.proposed_values ?? {}) as Record<string, string>).amount ?? "")}
                  postedBy={names[previewBatch?.confirmed_by ?? ""] || names[previewBatch?.uploaded_by ?? ""] || (previewBatch?.summary as { actorName?: string }).actorName || "You"}
                  when={previewBatch ? stamp(previewBatch.created_at) : ""}
                  statusLabel={singlePayment.status === "failed" ? "Not posted" : "Posted"}
                  avatarUrl={String(((singlePayment.proposed_values ?? {}) as Record<string, string>).supplierAvatarUrl ?? "")}
                  avatarSeed={String(((singlePayment.proposed_values ?? {}) as Record<string, string>).supplierAvatarSeed ?? "")}
                  organizationImageUrl={String(((singlePayment.proposed_values ?? {}) as Record<string, string>).supplierOrganizationImageUrl ?? "")}
                  organizationAvatarSeed={String(((singlePayment.proposed_values ?? {}) as Record<string, string>).supplierOrganizationAvatarSeed ?? "")}
                  onClose={() => { setPreviewBatch(null); setPreviewReturn(null); }}
                  facts={[
                    { label: "Trip", value: String(singlePayment.match_key ?? "") },
                    { label: "UTR", value: String(((singlePayment.proposed_values ?? {}) as Record<string, string>).utr ?? "") },
                    { label: "Paid on", value: String(((singlePayment.proposed_values ?? {}) as Record<string, string>).transactionDate ?? "") },
                    { label: "Mode", value: String(((singlePayment.proposed_values ?? {}) as Record<string, string>).mode ?? "") },
                  ].filter((fact) => fact.value.trim())}
                />
                {singlePayment.status === "failed" && singlePayment.message ? <Text style={styles.muted}>{String(singlePayment.message)}</Text> : null}
                {singleBatchFile ? (
                  <Pressable
                    style={styles.batchLink}
                    onPress={() => previewBatch && void openFile(singleBatchFile, { batch: previewBatch, rows: previewSourceRows })}
                    accessibilityRole="button"
                    accessibilityLabel={`Open batch file ${singleBatchFile.batch.file_name}`}
                  >
                    <Text style={styles.batchLinkText} numberOfLines={1}>Batch payment · {singleBatchFile.batch.file_name}</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : (
            <>
            <View style={styles.sheetHead}>
              <View style={styles.fileCopy}>
                <Text style={styles.kicker}>{previewBatch && (previewBatch.adapter_id === PAYMENT_POST_ADAPTER_ID || (previewBatch.summary as { kind?: string }).kind === "post") ? (showPreviewFilters ? "Posted payments" : "Posted payment") : "Updated fields"}</Text>
                <Text style={styles.sheetTitle} numberOfLines={1}>{previewBatch?.file_name || "Payment file"}</Text>
                <Text style={styles.muted}>
                  {previewBatch ? `Posted by ${names[previewBatch.confirmed_by ?? ""] || names[previewBatch.uploaded_by ?? ""] || (previewBatch.summary as { actorName?: string }).actorName || "You"} · ${stamp(previewBatch.created_at)}` : ""}
                </Text>
              </View>
              <Pressable onPress={() => { setPreviewBatch(null); setPreviewReturn(null); }} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Close preview">
                <Text style={styles.sheetCloseText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              {previewReturn ? (
                <Pressable
                  onPress={() => void openPreview(previewReturn.batch)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to payment"
                  style={styles.batchLink}
                >
                  <Text style={styles.batchLinkText}>Back to payment</Text>
                </Pressable>
              ) : null}
              {showPreviewFilters ? (
                <LogFilters
                  filters={filters}
                  suppliers={uniqueSupplierNames(previewSourceRows.map((row) => String(proposedOf(row).supplier ?? "")))}
                  onChange={setFilters}
                />
              ) : null}
              {singleBatchFile ? (
                <Pressable
                  style={styles.batchLink}
                  onPress={() => previewBatch && void openFile(singleBatchFile, { batch: previewBatch, rows: previewSourceRows })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open batch file ${singleBatchFile.batch.file_name}`}
                >
                  <Text style={styles.batchLinkText} numberOfLines={1}>Batch payment · {singleBatchFile.batch.file_name}</Text>
                </Pressable>
              ) : null}
              {previewBusy ? (
                <View style={styles.inline}>
                  <ActivityIndicator color={Theme.textMuted} />
                  <Text style={styles.muted}>Opening this confirmation…</Text>
                </View>
              ) : null}
              {previewRows.map((row) => {
                const before = (row.before_values ?? {}) as Record<string, string>;
                const proposed = (row.proposed_values ?? {}) as Record<string, string>;
                const changed = LOG_FIELDS.filter((field) => proposed[field.key]);
                const linked = [...(detail.events ?? [])].reverse().find((event) => String(event.row_id ?? "") === String(row.id));
                const postedRow = previewBatch?.adapter_id === PAYMENT_POST_ADAPTER_ID || (previewBatch?.summary as { kind?: string } | undefined)?.kind === "post";
                const statusLabel = postedRow && row.status === "applied" ? "Posted" : postedRow && row.status === "failed" ? "Not posted" : String(row.status);
                const supplier = String(proposed.supplier ?? "").trim();
                return (
                  <View key={String(row.id)} style={styles.previewRow}>
                    {supplier ? (
                      <View style={styles.supplierRow}>
                        <PaymentPartyMark name={supplier} avatarUrl={proposed.supplierAvatarUrl} avatarSeed={proposed.supplierAvatarSeed} organizationImageUrl={proposed.supplierOrganizationImageUrl} organizationAvatarSeed={proposed.supplierOrganizationAvatarSeed} />
                        <View style={styles.fileCopy}>
                          <Text style={styles.logName} numberOfLines={1}>{supplier}</Text>
                          <Text style={styles.muted}>Supplier</Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.rowTop}>
                      <Text style={styles.title}>{String(row.match_key ?? "Row")}</Text>
                      <Tag label={statusLabel} tone={String(row.status)} />
                    </View>
                    {row.status === "failed" && row.message ? <Text style={styles.muted}>{String(row.message)}</Text> : null}
                    {changed.length === 0 && row.status !== "failed" ? <Text style={styles.muted}>{String(row.message ?? "No field changed on this row.")}</Text> : null}
                    {changed.map((field) => (
                      before[field.key] ? (
                        <View key={field.key} style={styles.diffCols}>
                          <View style={styles.diffCol}>
                            <Text style={styles.diffKicker}>Was · {field.label}</Text>
                            <Text style={styles.diffValue}>{before[field.key]}</Text>
                          </View>
                          <View style={styles.diffCol}>
                            <Text style={styles.diffKicker}>Now</Text>
                            <Text style={styles.diffValue}>{proposed[field.key]}</Text>
                          </View>
                        </View>
                      ) : (
                        <View key={field.key} style={styles.diffCols}>
                          <View style={styles.diffCol}>
                            <Text style={styles.diffKicker}>{field.label}</Text>
                            <Text style={styles.diffValue}>{proposed[field.key] || "—"}</Text>
                          </View>
                        </View>
                      )
                    ))}
                    {before.mode ? <Text style={styles.kept}>Kept · mode {before.mode}</Text> : null}
                    {canCorrect && row.record_id && changed.some((field) => field.key === "utr") ? (
                      <View style={styles.stack}>
                        <TextInput
                          value={correction}
                          onChangeText={setCorrection}
                          placeholder="Replacement UTR"
                          placeholderTextColor={Theme.textMuted}
                          autoCapitalize="characters"
                          style={styles.input}
                        />
                        <Pressable
                          onPress={async () => {
                            if (!previewBatch) return;
                            if (!linked?.id) {
                              setNote("This row has no audit event to correct yet.");
                              return;
                            }
                            const saved = await correctPaymentField({
                              batchId: previewBatch.id,
                              rowId: String(row.id),
                              field: "utr",
                              value: correction,
                              correctsEventId: String(linked.id),
                            });
                            setNote(saved.error ? saved.error.message : "Correction added. The original event stays in the log.");
                            if (!saved.error) {
                              const loaded = await loadBulkBatchDetail(previewBatch.id);
                              if (!loaded.error) setDetail({ rows: loaded.rows, events: loaded.events });
                            }
                          }}
                        >
                          <Text style={styles.link}>Save correction</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {detail && previewRows.length === 0 ? <Text style={styles.muted}>{detail.rows.length === 0 ? "This file has no saved rows." : "Nothing in this preview matches the date or supplier."}</Text> : null}
            </ScrollView>
            </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const LOG_FIELDS = [
  { key: "utr", label: "UTR" },
  { key: "requestId", label: "Request ID" },
  { key: "transactionDate", label: "Transaction date" },
  { key: "amount", label: "Amount" },
  { key: "mode", label: "Mode" },
] as const;

function keptNames(selection: readonly PaymentUpdateField[]): string[] {
  return [
    selection.includes("amount") ? null : "Amount",
    selection.includes("mode") ? null : "Mode",
  ].filter((name): name is string => Boolean(name));
}

function keptStay(selection: readonly PaymentUpdateField[]): string {
  const names = keptNames(selection);
  return names.length === 0 ? "" : `${names.join(" and ")} stay as posted.`;
}

function keptAfter(selection: readonly PaymentUpdateField[]): string {
  const names = keptNames(selection);
  if (names.length === 0) return "";
  return `${names.join(" and ")} ${names.length === 1 ? "stays" : "stay"} as posted.`;
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontWeight: "600", color: Theme.textPrimary, letterSpacing: 0.2 },
  logItem: {
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  logHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  supplierRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  payBody: { padding: 20, gap: 16 },
  payCard: { gap: 16 },
  payHero: { flexDirection: "row", alignItems: "center", gap: 12 },
  payKicker: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: Theme.textMuted },
  payName: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark, lineHeight: 26 },
  payMeta: { fontSize: 12, lineHeight: 17, color: Theme.textMuted, marginTop: 2 },
  payAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  payAmount: { fontSize: 28, fontWeight: "800", color: Theme.textPrimaryDark, letterSpacing: -0.4 },
  payFacts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  payFact: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 140,
    backgroundColor: Theme.complianceSelectedWash,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  payFactValue: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  batchLink: {
    alignSelf: "stretch",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.complianceIconWash,
  },
  batchLinkText: { fontSize: 12, fontWeight: "700", color: Theme.complianceStageBalanceFg },
  batchLinkIndent: { marginLeft: 46 },
  logName: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  logAction: { fontSize: 11, lineHeight: 15, color: Theme.textPrimary },
  logFile: { fontSize: 11, color: Theme.textMuted },
  logTime: { fontSize: 10, color: Theme.textMuted, marginTop: 2 },
  eyeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  stack: { gap: 12 },
  filterBlock: { gap: 10 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterLabel: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  dateField: { flex: 1, minWidth: 0, gap: 4 },
  dateShell: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  dateShellOn: { borderColor: Theme.complianceStageBalanceFg },
  calendar: { gap: 8, paddingTop: 2 },
  calendarHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calendarNav: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  calendarNavText: { fontSize: 20, fontWeight: "700", color: Theme.textPrimary },
  calendarTitle: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  calendarWeek: { flexDirection: "row" },
  calendarWeekday: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: { width: "14.28%", height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  calendarDayInside: { backgroundColor: Theme.complianceIconWash },
  calendarDayOn: { backgroundColor: Theme.buttonDark },
  calendarDayText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  calendarDayTextOn: { color: Theme.buttonDarkText },
  dateValue: { flex: 1, fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  datePlaceholder: { color: Theme.textMuted, fontWeight: "500" },
  dateSheet: { backgroundColor: Theme.cardWhite, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  dateSheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 36,
    maxWidth: "100%",
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  chipOn: { backgroundColor: Theme.buttonDark },
  chipText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  chipTextOn: { color: Theme.buttonDarkText },
  filterInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    color: Theme.textPrimary,
    backgroundColor: Theme.cardWhite,
    fontSize: 13,
  },
  filterInputHalf: { flex: 1, minWidth: 0 },
  filterInputFull: { width: "100%" },
  mainPane: { width: "100%", minWidth: 0, gap: 12 },
  summaryPane: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  guideRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 28 },
  nextBar: { alignSelf: "stretch" },
  nextLine: { fontSize: 13, lineHeight: 18, color: Theme.textPrimary, marginTop: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Theme.surfaceBorder },
  tableHead: {
    width: 148,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    backgroundColor: Theme.complianceSelectedWash,
  },
  tableCell: { width: 148, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: Theme.textPrimaryDark },
  summaryStep: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  summaryStepNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceSelectedWash,
  },
  summaryStepNoOn: { backgroundColor: Theme.buttonDark },
  summaryStepNoText: { fontSize: 11, fontWeight: "800", color: Theme.textMuted },
  summaryStepNoTextOn: { color: Theme.buttonDarkText },
  summaryStepLabel: { fontSize: 13, fontWeight: "600", color: Theme.textMuted },
  stageRow: { flexDirection: "row", gap: 8 },
  stage: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  stageOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  stageText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  stageTextOn: { color: Theme.buttonDarkText },
  panel: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fieldCount: { fontSize: 11, fontWeight: "600", color: Theme.complianceStageBalanceFg },
  fieldGrid: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  fieldTile: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    paddingLeft: 10,
    paddingRight: 22,
    paddingVertical: 8,
    justifyContent: "center",
    gap: 2,
  },
  fieldTileOn: { borderColor: Theme.buttonDark, backgroundColor: Theme.complianceSelectedWash },
  fieldName: { fontSize: 12, fontWeight: "600", lineHeight: 16, color: Theme.textPrimaryDark },
  fieldNameOn: { color: Theme.textPrimaryDark },
  fieldHint: { fontSize: 10, lineHeight: 13, color: Theme.textMuted },
  fieldDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldDotOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  fieldDotText: { fontSize: 8, fontWeight: "600", color: Theme.buttonDarkText, lineHeight: 10 },
  templateRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  templateCard: {
    flex: 1,
    minWidth: 0,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.complianceSelectedWash,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  templateKicker: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3, color: Theme.complianceStageBalanceFg },
  templateTitle: { fontSize: 12, fontWeight: "600", color: Theme.textPrimary, textAlign: "center" },
  fileRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  dropFlex: { flex: 1, minWidth: 0 },
  dropWrap: { position: "relative" },
  pasteCard: {
    width: 112,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.complianceSelectedWash,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 1,
  },
  removeFile: {
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
  removeFileMark: { fontSize: 18, lineHeight: 20, fontWeight: "600", color: Theme.textPrimaryDark },
  pasteLink: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center" },
  pasteCell: { width: 120 },
  pasteMono: {
    fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "Courier",
    fontSize: 12,
  },
  pasteInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    textAlignVertical: "top",
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmCancel: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmProceed: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmProceedText: { fontSize: 14, fontWeight: "700", color: Theme.buttonDarkText },
  drop: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.complianceHoverBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  dropTitle: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark, textAlign: "center" },
  dropHint: { fontSize: 11, color: Theme.textMuted, textAlign: "center", lineHeight: 15 },
  fileMark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.complianceIconWash,
    alignItems: "center",
    justifyContent: "center",
  },
  fileMarkText: { fontSize: 10, fontWeight: "800", color: Theme.complianceStageBalanceFg },
  fileCopy: { flex: 1, minWidth: 0, gap: 2 },
  mapLabel: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  mapHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.complianceCardBorder,
  },
  mapHeadCell: { flex: 1, minWidth: 0, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  mapHeadText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, textAlign: "center" },
  sampleIndex: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  sampleValue: { fontSize: 12, fontWeight: "600", color: Theme.textPrimary, textAlign: "center" },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  mapLabelCol: { width: 132, minWidth: 132 },
  mapValueCol: { flex: 1, minWidth: 0 },
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
  stepStripInline: { flexDirection: "row", gap: 8 },
  stepChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceSelectedWash,
  },
  stepChipOn: { backgroundColor: Theme.buttonDark },
  stepChipText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  stepChipTextOn: { color: Theme.buttonDarkText },
  mapBlock: { gap: 0 },
  previewScroll: { maxHeight: 280 },
  previewList: { gap: 8 },
  previewRow: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  kicker: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: Theme.complianceStageBalanceFg },
  sheet: { backgroundColor: Theme.cardWhite, borderRadius: 16, overflow: "hidden" },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  sheetClose: { minHeight: Layout.minTouchTargetSize, justifyContent: "center", paddingHorizontal: 4 },
  sheetCloseText: { fontSize: 13, fontWeight: "700", color: Theme.textMuted },
  stepStrip: { flexDirection: "row", marginHorizontal: 20, borderWidth: 1, borderColor: Theme.complianceCardBorder, borderRadius: 12, overflow: "hidden" },
  stepCell: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: Theme.cardWhite },
  stepCellOn: { backgroundColor: Theme.buttonDark },
  stepIndex: { fontSize: 10, fontWeight: "800", color: Theme.textMuted },
  stepIndexOn: { color: Theme.buttonDarkText },
  stepLabel: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  stepLabelOn: { color: Theme.buttonDarkText },
  sheetScroll: { flexGrow: 1, flexShrink: 1 },
  sheetBody: { padding: 20, gap: 10 },
  sheetFoot: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 8, borderTopWidth: 1, borderTopColor: Theme.complianceCardBorder },
  footRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footPrimary: { flex: 1 },
  secondaryAction: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: { minHeight: Layout.minTouchTargetSize, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceSelectedWash,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 2,
  },
  summaryValue: { fontSize: 22, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "center" },
  summaryValueWarn: { color: Theme.complianceStageDocsFg },
  summaryLabel: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, textAlign: "center" },
  resultCard: { borderLeftWidth: 3 },
  diff: { gap: 6, paddingTop: 4 },
  diffCols: { flexDirection: "row", gap: 8 },
  diffCol: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.complianceSelectedWash,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  diffKicker: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: Theme.textMuted },
  diffValue: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  kept: { fontSize: 12, color: Theme.textMuted },
  skip: { minHeight: 36, justifyContent: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  muted: { fontSize: 13, color: Theme.textMuted, lineHeight: 18 },
  error: { fontSize: 13, color: Theme.teslaRed, lineHeight: 18 },
  title: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1 },
  primary: {
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: { color: Theme.buttonDarkText, fontWeight: "700", fontSize: 14, textAlign: "center" },
  disabled: { opacity: 0.45 },
  link: { color: Theme.textPrimary, fontWeight: "700", fontSize: 13 },
  card: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  detail: { gap: 4, paddingTop: 6 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: "700" },
  input: {
    minHeight: Layout.minTouchTargetSize,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: Theme.textPrimaryDark,
  },
  backdrop: { flex: 1, backgroundColor: Theme.overlayBackdrop, alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { width: "100%", maxWidth: 440, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, gap: 10 },
});
