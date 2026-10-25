import Theme from "@/constants/Theme";
import { ProvisionCnDnImpactTag } from "@/features/trips/components/trip-detail/adjustment/ProvisionCnDnImpactTag";
import {
  ProvisionRevisedPartiesCard,
  type ProvisionCostBreakdownLine,
} from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";
import {
  getAdjustmentReasonOptions,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";
import { formatINR } from "@/lib/format";
import Feather from "@expo/vector-icons/Feather";
import { memo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type ProvisionDesktopWizardProps = {
  side: "client" | "supplier";
  tripCode?: string | null;
  partyLabel?: string | null;
  clientName: string;
  supplierName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  sales: number;
  adjSales: number;
  cost: number;
  adjCost: number;
  revenueSideDelta: number;
  costSideDelta: number;
  costLaneLabel?: string;
  costBreakdownLines?: ProvisionCostBreakdownLine[];
  isAssetExecution?: boolean;
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  amountStr: string;
  onAmountChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  otherReason: string;
  onOtherReasonChange: (value: string) => void;
  reasonLocked?: boolean;
  canSubmit: boolean;
  submitting?: boolean;
  isEditing?: boolean;
  reviewBaseAmount: number;
  reviewRevisedAmount: number;
  onClose: () => void;
  onSubmit: () => void;
};

export const ProvisionDesktopWizard = memo(function ProvisionDesktopWizard(
  props: ProvisionDesktopWizardProps,
) {
  const isClient = props.side === "client";
  const isAssetDriverCost = Boolean(props.isAssetExecution && !isClient);
  const accent = isClient ? Theme.primary : "#0f766e";
  const noteKind = props.impact === "minus" ? "CN" : "DN";
  const title = isClient
    ? "Client sale"
    : props.isAssetExecution
      ? "Driver cost"
      : "Supplier cost";
  const reasons = getAdjustmentReasonOptions({
    type: props.type,
    isAssetDriverCost,
    impact: props.impact,
  });
  const selectedReason =
    props.reason === "Other" ? props.otherReason.trim() || "Other" : props.reason;
  const amountNum = Math.round(parseFloat(props.amountStr.replace(/,/g, "")) || 0);
  const delta = props.reviewRevisedAmount - props.reviewBaseAmount;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.kickerRow}>
            <View style={[styles.liveDot, { backgroundColor: accent }]} />
            <Text style={styles.kicker}>
              {props.isEditing ? "EDIT PROVISION" : "PROVISION ADJUST"}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {props.tripCode || props.partyLabel ? (
            <Text style={styles.sub} numberOfLines={2}>
              {[props.tripCode, props.partyLabel].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={props.onClose} style={styles.closeBtn} hitSlop={10} accessibilityLabel="Close">
          <Feather name="x" size={18} color="#64748b" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        <ProvisionRevisedPartiesCard
          clientName={props.clientName}
          clientAvatarUrl={props.clientAvatarUrl}
          clientAvatarSeed={props.clientAvatarSeed}
          sales={props.sales}
          adjSales={props.adjSales}
          revenueSideDelta={props.revenueSideDelta}
          supplierName={props.supplierName}
          supplierAvatarUrl={props.supplierAvatarUrl}
          supplierAvatarSeed={props.supplierAvatarSeed}
          cost={props.cost}
          adjCost={props.adjCost}
          costSideDelta={props.costSideDelta}
          costLaneLabel={props.costLaneLabel}
          costPartyEntityType={props.isAssetExecution ? "driver" : "supplier"}
          costBreakdownLines={props.costBreakdownLines}
          activeSide={props.side}
          variant="modal"
        />

        <View style={styles.noteRow}>
          <View style={[styles.notePill, props.impact === "minus" ? styles.notePillCn : styles.notePillDn]}>
            <Text style={[styles.notePillText, props.impact === "minus" ? styles.notePillTextCn : styles.notePillTextDn]}>
              {noteKind}
            </Text>
          </View>
          <View style={styles.noteCopy}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {selectedReason || (isClient ? "Sale provision" : "Cost provision")}
            </Text>
            <ProvisionCnDnImpactTag
              type={props.type}
              impact={props.impact}
              isAssetDriverCost={isAssetDriverCost}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Amount</Text>
        <View style={styles.amountBox}>
          <Text style={styles.amountPrefix}>₹</Text>
          <TextInput
            value={props.amountStr}
            onChangeText={props.onAmountChange}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={Theme.textMuted}
            style={styles.amountInput}
            accessibilityLabel="Provision amount"
          />
        </View>
        <Text style={styles.hint}>
          {isAssetDriverCost
            ? props.impact === "plus"
              ? "Debit increases driver trip cost."
              : "Credit reduces driver trip cost."
            : props.impact === "plus"
              ? `Debit (DN) increases ${isClient ? "sale income" : "supplier cost"}.`
              : `Credit (CN) reduces ${isClient ? "sale income" : "supplier cost"}.`}
        </Text>

        {props.reasonLocked ? null : (
          <>
            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={styles.chipWrap}>
              {reasons.map((item) => {
                const selected = props.reason === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.chip, selected && styles.chipOn]}
                    onPress={() => props.onReasonChange(item)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
            {props.reason === "Other" ? (
              <TextInput
                value={props.otherReason}
                onChangeText={props.onOtherReasonChange}
                placeholder="Enter reason"
                placeholderTextColor={Theme.textMuted}
                style={styles.otherInput}
                accessibilityLabel="Other reason"
              />
            ) : null}
          </>
        )}

        <View style={styles.reviseRow}>
          <View style={styles.reviseCell}>
            <Text style={styles.reviseLabel}>Current</Text>
            <Text style={styles.reviseValue}>{formatINR(props.reviewBaseAmount)}</Text>
          </View>
          <Text style={styles.reviseArrow}>→</Text>
          <View style={[styles.reviseCell, styles.reviseCellEnd]}>
            <Text style={styles.reviseLabel}>Revised</Text>
            <Text style={styles.reviseValue}>{formatINR(props.reviewRevisedAmount)}</Text>
            {amountNum > 0 ? (
              <Text style={styles.reviseDelta}>
                {delta >= 0 ? "+" : ""}
                {formatINR(delta)}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.ghostBtn} onPress={props.onClose} accessibilityRole="button">
          <Text style={styles.ghostBtnText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, (!props.canSubmit || props.submitting) && styles.primaryBtnOff]}
          onPress={props.onSubmit}
          disabled={!props.canSubmit || props.submitting}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>
            {props.submitting ? "Saving…" : props.isEditing ? "Save changes" : `Post ${noteKind}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Theme.positive,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    flexShrink: 0,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 0,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    marginBottom: 14,
  },
  notePill: {
    minWidth: 40,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  notePillCn: { backgroundColor: "#ecfdf5" },
  notePillDn: { backgroundColor: "#fff1f2" },
  notePillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  notePillTextCn: { color: Theme.darkGreen },
  notePillTextDn: { color: Theme.teslaRed },
  noteCopy: { flex: 1, minWidth: 0, gap: 4 },
  noteTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    gap: 8,
  },
  amountPrefix: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    paddingVertical: 10,
  },
  hint: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  chipOn: {
    borderColor: Theme.primary,
    backgroundColor: "#eff6ff",
  },
  chipText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  chipTextOn: { color: Theme.primary },
  otherInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 14,
    color: "#0f172a",
  },
  reviseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    marginBottom: 8,
  },
  reviseCell: { flex: 1, minWidth: 0 },
  reviseCellEnd: { alignItems: "flex-end" },
  reviseLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  reviseValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  reviseArrow: { fontSize: 16, color: Theme.textMuted, fontWeight: "700" },
  reviseDelta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  ghostBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  ghostBtnText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  primaryBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  primaryBtnOff: { opacity: 0.45 },
  primaryBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
