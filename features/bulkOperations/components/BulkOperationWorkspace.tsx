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
import { Eye } from "lucide-react-native";
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
import type { BulkPreviewRow, ColumnMapping } from "@/features/bulkOperations/utils/bulkOperation.model";
import { resolveComplianceActorNames } from "@/features/tripCompliance/services/complianceDocumentView.service";
import {
  confirmPaymentFieldBatch,
  correctPaymentField,
  listBulkBatches,
  loadBulkBatchDetail,
  type StoredBatch,
} from "@/features/bulkOperations/services/bulkHistory.service";

async function readUri(uri: string): Promise<string> {
  if (Platform.OS === "web") return (await fetch(uri)).text();
  return FileSystem.readAsStringAsync(uri, { encoding: "utf8" });
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
  "Upload the CSV. Use the template for the fields you selected.",
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
  onBatchSaved?: () => void;
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
  const issues = useMemo(() => mappingIssues(template, mapping), [template, mapping]);
  const ignored = useMemo(() => unmappedHeaders(headers, mapping), [headers, mapping]);
  const readyCount = includedReadyCount(rows);
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
      type: ["text/csv", "text/comma-separated-values", "*/*"],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setBusy("Reading the file…");
    try {
      const text = await readUri(asset.uri);
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
      setError("Nothing was updated. An invalid Trip ID blocks the whole file.");
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
    onBatchSaved?.();
  }, [canExecute, organizationId, category, fileName, fileText, mapping, selection, rows, onBatchSaved]);

  const fieldLabel = (field: PaymentUpdateField) =>
    field === "utr" ? "UTR" : field === "requestId" ? "Request ID" : field === "amount" ? "Amount" : field === "mode" ? "Mode" : "Transaction date";
  const fieldHint = (field: PaymentUpdateField) =>
    field === "utr" ? "Bank reference" : field === "requestId" ? "Internal request" : field === "amount" ? "Paid value" : field === "mode" ? "How it was paid" : "Settlement date";
  const keptNote = keptStay(selection);

  const activeStep = confirmOpen ? 4 : rows.length > 0 ? 3 : headers.length > 0 ? 2 : 1;
  const nextLine =
    headers.length === 0
      ? "Next: select the CSV. Nothing is checked until you open the preview."
      : rows.length === 0
        ? "Next: open the file. Preview shows every cell, then checks each Trip ID."
          : hasInvalid
          ? "Nothing will be updated. An invalid Trip ID blocks the whole file."
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
        <Text style={styles.sectionLabel}>Fields to update</Text>
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
                <Text style={styles.fieldName}>{fieldLabel(field)}</Text>
                <Text style={styles.fieldHint}>{fieldHint(field)}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.templateRow}>
          <Pressable style={styles.templateCard} onPress={() => void downloadTemplate("compliance-payment-update.csv", templateCsv(template))}>
            <Text style={styles.link}>CSV template v{template.version}</Text>
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
            <Text style={styles.link}>Excel template v{template.version}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.dropWrap}>
        <Pressable style={styles.drop} onPress={() => void pick()} disabled={!canReview}>
          <Text style={styles.dropTitle}>{fileName || (canReview ? "Select CSV" : "View access required")}</Text>
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
        style={styles.pasteLink}
        onPress={() => { setPasteText(""); setPasteOpen(true); }}
        disabled={!canReview}
        accessibilityRole="button"
      >
        <Text style={styles.link}>Paste CSV</Text>
      </Pressable>
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
                style={[styles.pasteInput, styles.pasteMono, Platform.OS === "web" ? ({ tabSize: 4 } as object) : null]}
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
                Check the Trip ID against this workspace, then the fields you selected.
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
                  <Text style={styles.sectionLabel}>{hasInvalid ? "Nothing will be updated" : "This will be updated"}</Text>
                  <Text style={styles.muted}>
                    {hasInvalid
                      ? "An invalid Trip ID blocks the whole file. Fix the file and preview it again."
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
              {confirmOpen && !hasInvalid ? (
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
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

export function BulkPaymentAuditLog({
  organizationId,
  category,
  refreshKey,
  canCorrect,
}: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  refreshKey: number;
  canCorrect: boolean;
}) {
  const [batches, setBatches] = useState<StoredBatch[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [previewBatch, setPreviewBatch] = useState<StoredBatch | null>(null);
  const [detail, setDetail] = useState<{ rows: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const server = await listBulkBatches({ organizationId, adapterId: "compliance-payment-field-update", limit: 40 });
      if (cancelled) return;
      if (server.error) setNote(server.error.message);
      else setNote(null);
      setBatches(server.batches.filter((batch) => categoryOf(batch) === category));
      const ids = server.batches.flatMap((batch) => [batch.uploaded_by, batch.confirmed_by]);
      const resolved = await resolveComplianceActorNames(ids, organizationId);
      if (!cancelled) setNames(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, category, refreshKey]);

  const openPreview = async (batch: StoredBatch) => {
    setPreviewBatch(batch);
    setDetail(null);
    setCorrection("");
    setPreviewBusy(true);
    const loaded = await loadBulkBatchDetail(batch.id);
    setPreviewBusy(false);
    if (loaded.error) setNote(loaded.error.message);
    else setDetail({ rows: loaded.rows, events: loaded.events });
  };

  const categoryLabel = category === "compliance_advance" ? "Advance" : "Balance";
  const actionLabel = (batch: StoredBatch) => {
    const fields = batch.field_selection?.length ? batch.field_selection.join(", ") : "selected fields";
    if (batch.status === "completed") return `Updated ${fields}`;
    if (batch.status === "partial") return `Partly updated ${fields}`;
    if (batch.status === "failed") return "Update did not finish";
    return `Confirmed ${fields}`;
  };

  return (
    <View style={styles.stack}>
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      {batches.length === 0 ? (
        <Text style={styles.muted}>No {categoryLabel.toLowerCase()} files confirmed yet.</Text>
      ) : null}
      {batches.map((batch) => {
        const who = names[batch.confirmed_by ?? ""] || names[batch.uploaded_by ?? ""] || "Unknown user";
        return (
          <View key={batch.id} style={styles.logItem}>
            <View style={styles.logHead}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(who)}</Text>
              </View>
              <View style={styles.fileCopy}>
                <Text style={styles.logName} numberOfLines={1}>{who}</Text>
                <Text style={styles.logAction} numberOfLines={2}>{actionLabel(batch)}</Text>
                <Text style={styles.logFile} numberOfLines={1}>{batch.file_name}</Text>
                <Text style={styles.logTime}>{stamp(batch.created_at)} · {categoryLabel}</Text>
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
          </View>
        );
      })}
      <Modal visible={previewBatch != null} transparent animationType="fade" onRequestClose={() => setPreviewBatch(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { width: Math.min(760, Math.max(320, width - 48)), maxHeight: Math.min(720, Math.max(420, height - 80)) }]}>
            <View style={styles.sheetHead}>
              <View style={styles.fileCopy}>
                <Text style={styles.kicker}>Updated fields</Text>
                <Text style={styles.sheetTitle} numberOfLines={1}>{previewBatch?.file_name || "Payment file"}</Text>
                <Text style={styles.muted}>
                  {previewBatch ? `${names[previewBatch.confirmed_by ?? ""] || names[previewBatch.uploaded_by ?? ""] || "Unknown user"} · ${stamp(previewBatch.created_at)} · ${previewBatch.status}` : ""}
                </Text>
              </View>
              <Pressable onPress={() => setPreviewBatch(null)} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Close preview">
                <Text style={styles.sheetCloseText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              {previewBusy ? (
                <View style={styles.inline}>
                  <ActivityIndicator color={Theme.textMuted} />
                  <Text style={styles.muted}>Opening the saved update…</Text>
                </View>
              ) : null}
              {detail?.rows.map((row) => {
                const before = (row.before_values ?? {}) as Record<string, string>;
                const proposed = (row.proposed_values ?? {}) as Record<string, string>;
                const changed = LOG_FIELDS.filter((field) => proposed[field.key]);
                const linked = [...(detail.events ?? [])].reverse().find((event) => String(event.row_id ?? "") === String(row.id));
                return (
                  <View key={String(row.id)} style={styles.previewRow}>
                    <View style={styles.rowTop}>
                      <Text style={styles.title}>{String(row.match_key ?? "Row")}</Text>
                      <Tag label={String(row.status)} tone={String(row.status)} />
                    </View>
                    {changed.length === 0 ? <Text style={styles.muted}>{String(row.message ?? "No field changed on this row.")}</Text> : null}
                    {changed.map((field) => (
                      <View key={field.key} style={styles.diffCols}>
                        <View style={styles.diffCol}>
                          <Text style={styles.diffKicker}>Was · {field.label}</Text>
                          <Text style={styles.diffValue}>{before[field.key] || "—"}</Text>
                        </View>
                        <View style={styles.diffCol}>
                          <Text style={styles.diffKicker}>Now</Text>
                          <Text style={styles.diffValue}>{proposed[field.key]}</Text>
                        </View>
                      </View>
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
              {detail && detail.rows.length === 0 ? <Text style={styles.muted}>This file has no saved rows.</Text> : null}
            </ScrollView>
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
  sectionLabel: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary, letterSpacing: 0.2 },
  logItem: {
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  logHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  avatarText: { fontSize: 10, fontWeight: "700", color: Theme.complianceStageBalanceFg, letterSpacing: 0.2 },
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
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 8 },
  fieldTile: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 120,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    gap: 1,
  },
  fieldTileOn: { borderColor: Theme.buttonDark, backgroundColor: Theme.complianceSelectedWash },
  fieldName: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  fieldNameOn: { color: Theme.textPrimaryDark },
  fieldHint: { fontSize: 11, color: Theme.textMuted },
  templateRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  templateCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 2,
  },
  templateKicker: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: Theme.complianceStageBalanceFg },
  dropWrap: { position: "relative" },
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
    paddingHorizontal: 44,
    paddingVertical: 16,
    gap: 4,
  },
  dropTitle: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  dropHint: { fontSize: 12, color: Theme.textMuted, textAlign: "center", lineHeight: 17 },
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
