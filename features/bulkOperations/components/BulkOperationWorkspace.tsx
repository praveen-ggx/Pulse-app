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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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

export function BulkOperationWorkspace({
  organizationId,
  category,
  grantedSurfaces,
  onBatchSaved,
}: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  grantedSurfaces: readonly string[];
  onBatchSaved?: () => void;
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
  const [result, setResult] = useState<string | null>(null);

  const template = useMemo(() => paymentFieldTemplate(selection), [selection]);
  useEffect(() => {
    if (headers.length === 0) return;
    setMapping((current) => ({ ...suggestMapping(headers, template.fields), ...current }));
  }, [headers, template]);
  const issues = useMemo(() => mappingIssues(template, mapping), [template, mapping]);
  const ignored = useMemo(() => unmappedHeaders(headers, mapping), [headers, mapping]);
  const readyCount = includedReadyCount(rows);
  const blockedCount = rows.filter((row) => row.status !== "ready").length;

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
      const bytes = new TextEncoder().encode(text).length;
      if (bulkFileExceedsLimit(bytes)) {
        setError("This file is over the 1 MB limit. Split it into smaller files. No payment was changed.");
        return;
      }
      const sheet = parseBulkCsv(text);
      if (sheet.headers.length === 0 || sheet.rows.length === 0) {
        setError("The file needs a header row and at least one data row.");
        return;
      }
      setFileName(asset.name ?? "payments.csv");
      setFileText(text);
      setHeaders(sheet.headers);
      setMatrix(sheet.rows);
      setMapping(suggestMapping(sheet.headers, template.fields));
      setRows([]);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }, [template.fields]);

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
          ? "Updated. The file, time and user are in the update log. Amount and mode were not changed."
          : status === "partial"
            ? "Some rows were not updated. Nothing else was retried. Open the update log for each row."
            : status === "failed"
              ? "No payment field was updated. The file is in the update log."
              : "The update did not finish. No further rows were retried.",
    );
    setRows([]);
    onBatchSaved?.();
  }, [canExecute, organizationId, category, fileName, fileText, mapping, selection, rows, onBatchSaved]);

  const fieldLabel = (field: PaymentUpdateField) =>
    field === "utr" ? "UTR" : field === "requestId" ? "Request ID" : "Transaction date";
  const fieldHint = (field: PaymentUpdateField) =>
    field === "utr" ? "Bank reference" : field === "requestId" ? "Internal request" : "Settlement date";
  const stage = rows.length > 0 ? 3 : headers.length > 0 ? 2 : 1;

  return (
    <View style={styles.stack}>
      <View style={styles.stageRow}>
        {["Fields", "File", "Review"].map((label, index) => {
          const on = stage === index + 1;
          const done = stage > index + 1;
          return (
            <View key={label} style={[styles.stage, (on || done) && styles.stageOn]}>
              <Text style={[styles.stageText, (on || done) && styles.stageTextOn]}>
                {index + 1}  {label}
              </Text>
            </View>
          );
        })}
      </View>

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
              <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{fieldLabel(field)}</Text>
              <Text style={[styles.fieldHint, on && styles.fieldHintOn]}>{fieldHint(field)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.templateRow}>
      <Pressable style={styles.templateCard} onPress={() => void downloadTemplate("compliance-payment-update.csv", templateCsv(template))}>
        <Text style={styles.templateKicker}>CSV</Text>
        <Text style={styles.link}>Download CSV template v{template.version}</Text>
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
        <Text style={styles.link}>Download Excel template v{template.version}</Text>
      </Pressable>
      </View>
      </View>
      <Pressable style={styles.drop} onPress={() => void pick()} disabled={!canReview}>
        <Text style={styles.dropTitle}>{canReview ? "Select CSV" : "View access required to upload"}</Text>
        <Text style={styles.dropHint}>
          {fileName
            ? fileName
            : "CSV up to 1 MB. UTR, request ID and transaction date only. Amount and mode stay as posted."}
        </Text>
      </Pressable>
      {busy ? (
        <View style={styles.inline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.muted}>{busy}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {headers.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.fileMark}>
              <Text style={styles.fileMarkText}>CSV</Text>
            </View>
            <View style={styles.fileCopy}>
              <Text style={styles.title}>{fileName}</Text>
              <Text style={styles.muted}>{matrix.length} data {matrix.length === 1 ? "row" : "rows"}</Text>
            </View>
          </View>
          {template.fields.map((field) => (
            <View key={field.key} style={styles.detail}>
              <Text style={styles.mapLabel}>{field.label}{field.required ? " · required" : ""}</Text>
              <Text style={styles.muted}>{field.format}</Text>
              <View style={styles.tagRow}>
                {headers.map((header) => {
                  const on = mapping[field.key] === header;
                  return (
                    <Pressable
                      key={`${field.key}-${header}`}
                      style={[styles.choice, on && styles.choiceOn]}
                      onPress={() => setMapping((current) => ({ ...current, [field.key]: header }))}
                    >
                      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{header}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {issues.map((issue) => (
            <Text key={issue.message} style={styles.error}>{issue.message}</Text>
          ))}
          {ignored.length > 0 ? <Text style={styles.muted}>Not used: {ignored.join(", ")}</Text> : null}
          <Pressable style={styles.primary} onPress={() => void review()}>
            <Text style={styles.primaryText}>Review rows</Text>
          </Pressable>
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.stack}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{readyCount}</Text>
              <Text style={styles.summaryLabel}>Will update</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, blockedCount > 0 && styles.summaryValueWarn]}>{blockedCount}</Text>
              <Text style={styles.summaryLabel}>Need attention</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{rows.length}</Text>
              <Text style={styles.summaryLabel}>Rows read</Text>
            </View>
          </View>
          {rows.map((row) => {
            const tone = TONE[row.status] ?? TONE.unchanged;
            return (
            <View key={row.rowIndex} style={[styles.card, styles.resultCard, { borderLeftColor: tone.fg }]}>
              <View style={styles.rowTop}>
                <Text style={styles.title}>{row.matchKey || `Row ${row.rowIndex}`}</Text>
                <Tag label={row.status} tone={row.status} />
              </View>
              <Text style={styles.muted}>{row.message}</Text>
              {selection.map((field) => (
                <View key={field} style={styles.diff}>
                  <Text style={styles.mapLabel}>{fieldLabel(field)}</Text>
                  <View style={styles.diffCols}>
                    <View style={styles.diffCol}>
                      <Text style={styles.diffKicker}>Now</Text>
                      <Text style={styles.diffValue}>{row.before[field] || "—"}</Text>
                    </View>
                    <View style={styles.diffCol}>
                      <Text style={styles.diffKicker}>After</Text>
                      <Text style={styles.diffValue}>{row.proposed[field] || "—"}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <Text style={styles.kept}>Kept  ·  amount {row.preserved.amount || "—"}  ·  mode {row.preserved.mode || "—"}</Text>
              {row.status === "ready" ? (
                <Pressable
                  style={styles.skip}
                  onPress={() => setRows((current) => current.map((item) => item.rowIndex === row.rowIndex ? { ...item, included: !item.included } : item))}
                >
                  <Text style={styles.link}>{row.included ? "Skip this row" : "Include this row"}</Text>
                </Pressable>
              ) : null}
            </View>
            );
          })}
          <Pressable
            style={[styles.primary, (!canExecute || readyCount === 0) && styles.disabled]}
            disabled={!canExecute || readyCount === 0}
            onPress={() => setConfirmOpen(true)}
          >
            <Text style={styles.primaryText}>{canExecute ? `Confirm ${readyCount} updates` : "Manage access required to confirm"}</Text>
          </Pressable>
        </View>
      ) : null}
      {result ? <Text style={styles.muted}>{result}</Text> : null}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>Update {readyCount} payments?</Text>
            <Text style={styles.muted}>
              This is the only step that changes payments. Amount and mode stay as they are. The batch is stored before the first payment write.
            </Text>
            <Pressable style={styles.primary} onPress={() => void confirm()}>
              <Text style={styles.primaryText}>Confirm update</Text>
            </Pressable>
            <Pressable onPress={() => setConfirmOpen(false)}>
              <Text style={styles.link}>Back to preview</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ rows: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");

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

  const categoryLabel = category === "compliance_advance" ? "Advance" : "Balance";

  return (
    <View style={styles.stack}>
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      {batches.length === 0 ? (
        <Text style={styles.muted}>No {categoryLabel.toLowerCase()} files confirmed yet.</Text>
      ) : null}
      {batches.map((batch) => {
        const open = openId === batch.id;
        const who = names[batch.confirmed_by ?? ""] || names[batch.uploaded_by ?? ""] || "Unknown user";
        return (
          <View key={batch.id} style={styles.card}>
            <Pressable
              onPress={async () => {
                if (open) {
                  setOpenId(null);
                  setDetail(null);
                  return;
                }
                setOpenId(batch.id);
                const loaded = await loadBulkBatchDetail(batch.id);
                if (loaded.error) setNote(loaded.error.message);
                else setDetail({ rows: loaded.rows, events: loaded.events });
              }}
            >
            <View style={styles.rowTop}>
              <Text style={styles.title}>{batch.file_name}</Text>
              <Tag label={batch.status} tone={batch.status === "completed" ? "applied" : batch.status === "failed" ? "failed" : "unchanged"} />
            </View>
            </Pressable>
            <Text style={styles.muted}>
              {categoryLabel} · {stamp(batch.created_at)} · {who}
              {batch.file_sha256 ? ` · ${batch.file_sha256.slice(0, 12)}` : ""}
            </Text>
            {open && detail ? (
              <View style={styles.stack}>
                {detail.events.map((event) => (
                  <Text key={String(event.id)} style={styles.muted}>
                    {stamp(String(event.created_at ?? ""))} · {String(event.event_type)} · {names[String(event.actor_id ?? "")] || who}
                  </Text>
                ))}
                {detail.rows.map((row) => {
                  const before = (row.before_values ?? {}) as Record<string, string>;
                  const proposed = (row.proposed_values ?? {}) as Record<string, string>;
                  const linked = [...detail.events].reverse().find((event) => String(event.row_id ?? "") === String(row.id));
                  return (
                    <View key={String(row.id)} style={styles.detail}>
                      <Text style={styles.title}>{String(row.match_key ?? "Row")}</Text>
                      <Text style={styles.muted}>
                        {String(row.status)} · {before.utr || "—"} → {proposed.utr || before.utr || "—"}
                      </Text>
                      {canCorrect && row.record_id ? (
                        <View style={styles.stack}>
                          <TextInput
                            value={open ? correction : ""}
                            onChangeText={setCorrection}
                            placeholder="Replacement UTR"
                            placeholderTextColor={Theme.textMuted}
                            autoCapitalize="characters"
                            style={styles.input}
                          />
                          <Pressable
                            onPress={async () => {
                              if (!linked?.id) {
                                setNote("This row has no audit event to correct yet.");
                                return;
                              }
                              const saved = await correctPaymentField({
                                batchId: batch.id,
                                rowId: String(row.id),
                                field: "utr",
                                value: correction,
                                correctsEventId: String(linked.id),
                              });
                              setNote(saved.error ? saved.error.message : "Correction added. The original event stays in the log.");
                              if (!saved.error) {
                                const loaded = await loadBulkBatchDetail(batch.id);
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
              </View>
            ) : null}
          </View>
        );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary, letterSpacing: 0.2 },
  stack: { gap: 12 },
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
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldTile: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.complianceSelectedWash,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 2,
  },
  fieldTileOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  fieldHint: { fontSize: 11, color: Theme.textMuted },
  fieldHintOn: { color: Theme.compliancePayTableTitleMuted },
  templateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  templateCard: {
    flexGrow: 1,
    flexBasis: 180,
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
  drop: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.complianceHoverBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
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
  mapLabel: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCell: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 2,
  },
  summaryValue: { fontSize: 22, fontWeight: "800", color: Theme.textPrimaryDark },
  summaryValueWarn: { color: Theme.complianceStageDocsFg },
  summaryLabel: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
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
  choice: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  choiceOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  choiceText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  choiceTextOn: { color: Theme.buttonDarkText },
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
