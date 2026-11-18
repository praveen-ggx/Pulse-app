/**
 * Preview, confirm, and revisit bulk UTR / transaction-date updates.
 * Writes go through the existing compliance payment editors.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { syncFinanceComplianceCaches } from "@/lib/queries/syncFinanceComplianceCaches";
import {
  applyComplianceBulkUpdate,
  previewComplianceBulkUpdate,
} from "@/features/tripCompliance/services/complianceBulkUpdate.service";
import { updateCompliancePaymentReference } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import {
  bulkUpdateTagLabel,
  parseBulkUpdateCsv,
  reviseBulkUpdateUtr,
  type BulkUpdatePreviewRow,
  type BulkUpdateTag,
} from "@/features/tripCompliance/utils/complianceBulkUpdate.util";
import {
  loadBulkUpdateBatches,
  replaceBulkUpdateBatch,
  saveBulkUpdateBatch,
  type BulkUpdateBatch,
  type BulkUpdateHistoryTag,
} from "@/features/tripCompliance/utils/complianceBulkUpdateHistory.util";

async function readUriAsText(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.text();
  }
  return FileSystem.readAsStringAsync(uri, { encoding: "utf8" });
}

type Panel = "update" | "history";

const TAG_TONE: Record<BulkUpdateTag | BulkUpdateHistoryTag, { fg: string; bg: string }> = {
  ready: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
  updated: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
  unchanged: { fg: Theme.textMuted, bg: Theme.cardWhite },
  edited: { fg: Theme.complianceStageInfoFg, bg: Theme.complianceStageInfoBg },
  no_payment: { fg: Theme.complianceStagePendingFg, bg: Theme.complianceStagePendingBg },
  cash: { fg: Theme.complianceStagePendingFg, bg: Theme.complianceStagePendingBg },
  invalid: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
  duplicate: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
  failed: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
};

function Tag({ label, tone }: { label: string; tone: BulkUpdateTag | BulkUpdateHistoryTag }) {
  const colors = TAG_TONE[tone];
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg }]}>
      <Text style={[styles.tagText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

export function ComplianceBulkUpdatePanel({
  organizationId,
  category,
  panel,
}: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  panel: Panel;
}) {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkUpdatePreviewRow[]>([]);
  const [busy, setBusy] = useState<"read" | "apply" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applied, setApplied] = useState<{ updated: number; failed: number } | null>(null);
  const [batches, setBatches] = useState<BulkUpdateBatch[]>([]);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ batchId: string; transactionId: string; value: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBulkUpdateBatches(organizationId).then((loaded) => {
      if (!cancelled) setBatches(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    setRows([]);
    setFileName(null);
    setApplied(null);
    setError(null);
    setConfirmOpen(false);
  }, [category]);

  const readyCount = rows.filter((row) => row.tag === "ready" && row.included).length;
  const counts = useMemo(() => {
    const tally = { ready: 0, unchanged: 0, no_payment: 0, cash: 0, invalid: 0, duplicate: 0 };
    for (const row of rows) tally[row.tag] += 1;
    return tally;
  }, [rows]);

  const pickFile = useCallback(async () => {
    setError(null);
    setApplied(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setFileName(asset.name ?? "payments.csv");
    setBusy("read");
    try {
      const text = await readUriAsText(asset.uri);
      const parsed = parseBulkUpdateCsv(text);
      if (parsed.length === 0) {
        setRows([]);
        setError("The file needs a header row and at least one payment.");
        return;
      }
      const preview = await previewComplianceBulkUpdate({
        organizationId,
        category,
        rows: parsed,
      });
      setRows(preview);
    } catch (cause) {
      setRows([]);
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }, [organizationId, category]);

  const apply = useCallback(async () => {
    const chosen = rows.filter((row) => row.tag === "ready" && row.included);
    if (chosen.length === 0) return;
    setConfirmOpen(false);
    setBusy("apply");
    setError(null);
    try {
      const results = await applyComplianceBulkUpdate({ category, rows: chosen });
      const failed = new Set(results.filter((result) => result.error).map((result) => result.rowIndex));
      const historyRows = chosen.map((row) => {
        const failure = results.find((result) => result.rowIndex === row.rowIndex)?.error;
        return {
          tripId: row.tripId ?? "",
          tripLabel: row.tripLabel,
          transactionId: row.transactionId ?? "",
          previousUtr: row.currentUtr,
          appliedUtr: failure ? row.currentUtr : row.nextUtr || row.currentUtr,
          previousDate: row.currentDate,
          appliedDate: failure ? row.currentDate : row.nextDate || row.currentDate,
          tag: (failure ? "failed" : "updated") as BulkUpdateHistoryTag,
          error: failure?.message,
        };
      });
      const batch: BulkUpdateBatch = {
        id: `${Date.now()}`,
        organizationId,
        fileName: fileName ?? "payments.csv",
        category,
        createdAt: new Date().toISOString(),
        rows: historyRows,
      };
      const saved = await saveBulkUpdateBatch(batch);
      setBatches(saved);
      setOpenBatchId(batch.id);
      const updated = historyRows.filter((row) => row.tag === "updated").length;
      setApplied({ updated, failed: failed.size });
      setRows([]);
      const first = historyRows.find((row) => row.tag === "updated");
      if (first) {
        syncFinanceComplianceCaches({ queryClient, organizationId, tripId: first.tripId });
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }, [rows, category, organizationId, fileName, queryClient]);

  const saveCorrection = useCallback(async () => {
    if (!edit) return;
    const batch = batches.find((item) => item.id === edit.batchId);
    const row = batch?.rows.find((item) => item.transactionId === edit.transactionId);
    if (!batch || !row) return;
    setBusy("edit");
    setError(null);
    const { error: writeError } = await updateCompliancePaymentReference({
      tripId: row.tripId,
      transactionId: row.transactionId,
      category: batch.category,
      utr: edit.value,
    });
    if (writeError) {
      setError(writeError.message);
      setBusy(null);
      return;
    }
    const nextBatch: BulkUpdateBatch = {
      ...batch,
      rows: batch.rows.map((item) =>
        item.transactionId === row.transactionId
          ? { ...item, appliedUtr: edit.value.replace(/\s+/g, "").toUpperCase(), tag: "edited", error: undefined }
          : item,
      ),
    };
    const saved = await replaceBulkUpdateBatch(nextBatch);
    setBatches(saved);
    setEdit(null);
    setBusy(null);
    syncFinanceComplianceCaches({ queryClient, organizationId, tripId: row.tripId });
  }, [edit, batches, organizationId, queryClient]);

  const openBatch = batches.find((batch) => batch.id === openBatchId) ?? null;
  const categoryLabel = category === "compliance_advance" ? "Advance" : "Balance";

  if (panel === "history") {
    return (
      <View style={styles.stack}>
        {batches.length === 0 ? (
          <Text style={styles.muted}>No bulk updates yet. A file you confirm will show up here for review.</Text>
        ) : (
          batches.map((batch) => {
            const updated = batch.rows.filter((row) => row.tag === "updated" || row.tag === "edited").length;
            const failed = batch.rows.filter((row) => row.tag === "failed").length;
            const open = openBatch?.id === batch.id;
            return (
              <View key={batch.id} style={styles.card}>
                <TouchableOpacity onPress={() => setOpenBatchId(open ? null : batch.id)} style={styles.cardHead}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{batch.fileName}</Text>
                    <Text style={styles.muted}>
                      {new Date(batch.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      {" · "}
                      {batch.category === "compliance_advance" ? "Advance" : "Balance"}
                    </Text>
                  </View>
                  <Tag label={`${updated} updated`} tone="updated" />
                  {failed > 0 ? <Tag label={`${failed} failed`} tone="failed" /> : null}
                </TouchableOpacity>
                {open
                  ? batch.rows.map((row) => (
                      <View key={row.transactionId} style={styles.historyRow}>
                        <View style={styles.rowTop}>
                          <Text style={styles.tripLabel}>{row.tripLabel}</Text>
                          <Tag label={row.tag === "edited" ? "Corrected" : row.tag === "failed" ? "Failed" : "Updated"} tone={row.tag} />
                        </View>
                        <Text style={styles.muted}>
                          {row.previousUtr || "No UTR"} → {row.appliedUtr || "No UTR"}
                        </Text>
                        {row.error ? <Text style={styles.error}>{row.error}</Text> : null}
                        {row.tag !== "failed" ? (
                          <TouchableOpacity
                            onPress={() => setEdit({ batchId: batch.id, transactionId: row.transactionId, value: row.appliedUtr })}
                            style={styles.textBtn}
                          >
                            <Text style={styles.textBtnLabel}>Change UTR</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))
                  : null}
              </View>
            );
          })
        )}
        <EditUtrModal
          visible={edit != null}
          value={edit?.value ?? ""}
          busy={busy === "edit"}
          onChange={(value) => setEdit((current) => (current ? { ...current, value } : current))}
          onClose={() => setEdit(null)}
          onSave={() => void saveCorrection()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Text style={styles.muted}>
        Upload the Advance Payment export, or a CSV with Trip ID and UTR. Nothing is written until you confirm the preview.
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => void pickFile()} disabled={busy != null}>
        <Text style={styles.primaryBtnText}>{rows.length > 0 ? "Choose another CSV" : "Select CSV"}</Text>
      </TouchableOpacity>
      {busy === "read" ? (
        <View style={styles.inline}>
          <ActivityIndicator color={Theme.textMuted} />
          <Text style={styles.muted}>Matching {fileName} to posted payments…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {applied ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Updated {applied.updated} {categoryLabel.toLowerCase()} payment{applied.updated === 1 ? "" : "s"}
          </Text>
          {applied.failed > 0 ? <Text style={styles.error}>{applied.failed} could not be saved.</Text> : null}
          <Text style={styles.muted}>Open Past updates to review this file or correct a UTR.</Text>
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.stack}>
          <View style={styles.tagRow}>
            <Tag label={`Will update ${readyCount}`} tone="ready" />
            <Tag label={`Already set ${counts.unchanged}`} tone="unchanged" />
            {counts.no_payment > 0 ? <Tag label={`No payment ${counts.no_payment}`} tone="no_payment" /> : null}
            {counts.invalid + counts.duplicate > 0 ? (
              <Tag label={`Needs a fix ${counts.invalid + counts.duplicate}`} tone="invalid" />
            ) : null}
            {counts.cash > 0 ? <Tag label={`Cash ${counts.cash}`} tone="cash" /> : null}
          </View>
          {rows.map((row) => (
            <View key={row.rowIndex} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.tripLabel}>{row.tripLabel}</Text>
                <Tag label={bulkUpdateTagLabel(row.tag)} tone={row.tag} />
              </View>
              <Text style={styles.muted}>
                Posted UTR {row.currentUtr || "—"}
                {row.currentDate ? ` · ${row.currentDate}` : ""}
                {row.mode ? ` · ${row.mode}` : ""}
              </Text>
              {row.tag === "ready" || row.tag === "invalid" || row.tag === "duplicate" || row.tag === "unchanged" ? (
                <TextInput
                  value={row.nextUtr}
                  onChangeText={(value) => setRows((current) => reviseBulkUpdateUtr(current, row.rowIndex, value))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="New UTR"
                  placeholderTextColor={Theme.textMuted}
                  style={styles.input}
                />
              ) : null}
              <Text style={styles.detail}>{row.detail}</Text>
              {row.tag === "ready" ? (
                <TouchableOpacity
                  onPress={() =>
                    setRows((current) =>
                      current.map((item) => (item.rowIndex === row.rowIndex ? { ...item, included: !item.included } : item)),
                    )
                  }
                  style={styles.textBtn}
                >
                  <Text style={styles.textBtnLabel}>{row.included ? "Skip this row" : "Include this row"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            style={[styles.primaryBtn, readyCount === 0 && styles.primaryBtnDisabled]}
            disabled={readyCount === 0 || busy != null}
            onPress={() => setConfirmOpen(true)}
          >
            <Text style={styles.primaryBtnText}>
              {busy === "apply" ? "Updating…" : `Update ${readyCount} payment${readyCount === 1 ? "" : "s"}`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>
              Update {readyCount} {categoryLabel.toLowerCase()} payment{readyCount === 1 ? "" : "s"}?
            </Text>
            <Text style={styles.muted}>
              {fileName} · {counts.unchanged} already match and will be left as they are.
            </Text>
            {rows
              .filter((row) => row.tag === "ready" && row.included)
              .slice(0, 6)
              .map((row) => (
                <Text key={row.rowIndex} style={styles.detail}>
                  {row.tripLabel}: {row.currentUtr || "—"} → {row.nextUtr || row.currentUtr}
                  {row.nextDate && row.nextDate !== row.currentDate ? ` · ${row.nextDate}` : ""}
                </Text>
              ))}
            {readyCount > 6 ? <Text style={styles.muted}>and {readyCount - 6} more</Text> : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void apply()}>
              <Text style={styles.primaryBtnText}>Confirm update</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textBtn} onPress={() => setConfirmOpen(false)}>
              <Text style={styles.textBtnLabel}>Back to preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EditUtrModal({
  visible,
  value,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.cardTitle}>Correct this UTR</Text>
          <Text style={styles.muted}>This replaces the UTR on the posted payment. Amount and mode stay the same.</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="UTR"
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
          />
          <TouchableOpacity style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]} disabled={busy} onPress={onSave}>
            <Text style={styles.primaryBtnText}>{busy ? "Saving…" : "Save correction"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textBtn} onPress={onClose}>
            <Text style={styles.textBtnLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  muted: { fontSize: 13, color: Theme.textMuted, lineHeight: 18 },
  error: { fontSize: 13, color: Theme.teslaRed, lineHeight: 18 },
  detail: { fontSize: 12, color: Theme.textPrimary, lineHeight: 18 },
  primaryBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 14, color: Theme.buttonDarkText, fontWeight: "700", textAlign: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: "700" },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    padding: 12,
    gap: 6,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tripLabel: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1 },
  historyRow: { gap: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.complianceCardBorder },
  input: {
    minHeight: Layout.minTouchTargetSize,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.compliancePageBg,
    fontSize: 14,
  },
  textBtn: { minHeight: 36, justifyContent: "center" },
  textBtnLabel: { fontSize: 13, fontWeight: "600", color: Theme.textMuted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
});
