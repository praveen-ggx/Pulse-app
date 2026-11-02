import { FullscreenNumericEntry } from "@/components/mobile-input";
import { PartyCreateSuccessModal } from "@/components/party/PartyCreateSuccessModal";
import {
  driverBodySecondary,
  driverUIBold,
  driverUISemiBold,
} from "@/constants/DriverTypography";
import Theme from "@/constants/Theme";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type TagReceivableDraft = {
  partyName: string;
  amount: string;
  subtitle?: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
};

type Props = {
  pendingName: string | null;
  confirming?: boolean;
  successName: string | null;
  created?: boolean;
  billedAmount?: number | null;
  receivable?: TagReceivableDraft | null;
  onChangeReceivableAmount?: (value: string) => void;
  onCancelReceivable?: () => void;
  onContinueReceivable?: (amount?: string) => void;
  onBackConfirm?: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
  onSuccessOk: () => void;
};

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function StepPlan({
  current,
  labels,
}: {
  current: 1 | 2;
  labels: [string, string];
}) {
  return (
    <View style={styles.plan} accessibilityRole="text" accessibilityLabel={`Step ${current} of 2`}>
      {labels.map((label, index) => {
        const step = (index + 1) as 1 | 2;
        const active = current === step;
        const done = current > step;
        return (
          <View key={label} style={styles.planItem}>
            {index > 0 ? (
              <View style={[styles.planLine, (active || done) && styles.planLineOn]} />
            ) : null}
            <View style={[styles.planDot, (active || done) && styles.planDotOn]}>
              <Text style={[styles.planNum, (active || done) && styles.planNumOn]}>{step}</Text>
            </View>
            <Text style={[styles.planLabel, active && styles.planLabelOn]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ConfirmBody({
  pendingName,
  billed,
  confirming,
  showPlan,
  onBack,
  onConfirm,
}: {
  pendingName: string;
  billed: number | null;
  confirming: boolean;
  showPlan: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      {showPlan ? <StepPlan current={2} labels={["Amount", "Confirm"]} /> : null}
      <Text style={styles.kicker}>Tag party</Text>
      <Text style={styles.title}>Tag this trip?</Text>
      <Text style={styles.body}>
        {billed
          ? `Bill this trip to ${pendingName} for ${formatInr(billed)}. Receivables will update to this amount.`
          : `Bill this trip to ${pendingName}. Outstanding and collect will follow this party.`}
      </Text>
      {billed ? (
        <View style={styles.summary}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Party</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {pendingName}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Receivable</Text>
            <Text style={styles.summaryValue}>{formatInr(billed)}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={confirming ? undefined : onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={showPlan ? "Back" : "Cancel"}
        >
          <Text style={styles.backText}>{showPlan ? "Back" : "Cancel"}</Text>
        </Pressable>
        <Pressable
          onPress={confirming ? undefined : onConfirm}
          style={[styles.goBtn, confirming && styles.goDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Tag party"
        >
          <Text style={styles.goText}>{confirming ? "Tagging…" : "Tag party"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function DriverTagPartyDialogs({
  pendingName,
  confirming = false,
  successName,
  created = false,
  billedAmount = null,
  receivable = null,
  onChangeReceivableAmount,
  onCancelReceivable,
  onContinueReceivable,
  onBackConfirm,
  onCancelConfirm,
  onConfirm,
  onSuccessOk,
}: Props) {
  const billed = billedAmount != null && billedAmount > 0 ? billedAmount : null;
  const showConfirm = !!pendingName && !successName;
  const confirmHasPriorStep = billed != null && !!onBackConfirm;
  const partyName = receivable?.partyName || pendingName || "";
  const amountPageOpen =
    !successName && (!!receivable || (showConfirm && confirmHasPriorStep));

  return (
    <>
      <FullscreenNumericEntry
        visible={amountPageOpen}
        onClose={() => {
          if (showConfirm && confirmHasPriorStep) onBackConfirm?.();
          else onCancelReceivable?.();
        }}
        onSubmit={(value) => {
          onChangeReceivableAmount?.(value);
          onContinueReceivable?.(value);
        }}
        initialValue={receivable?.amount ?? (billed != null ? String(billed) : "")}
        label="Collect from"
        contextLine={
          partyName
            ? `Enter the collection receivable for ${partyName}. This is the amount that shows under their AR for this trip.`
            : "Set the receivable for this party."
        }
        partyPreview={
          partyName
            ? {
                name: partyName,
                subtitle: receivable?.subtitle || "Shipper · client receivable",
                entityType: "client",
                avatarUrl: receivable?.avatarUrl,
                avatarSeed: receivable?.avatarSeed,
                organizationImageUrl: receivable?.organizationImageUrl,
                organizationAvatarSeed: receivable?.organizationAvatarSeed,
                isIntegrated: receivable?.isIntegrated,
              }
            : undefined
        }
        type="currency"
        prefix="₹"
        placeholder="0"
        allowDecimal={false}
        maxDecimalPlaces={0}
        submitLabel="Continue"
        overlay={
          showConfirm && confirmHasPriorStep && pendingName ? (
            <ConfirmBody
              pendingName={pendingName}
              billed={billed}
              confirming={confirming}
              showPlan
              onBack={onBackConfirm ?? onCancelConfirm}
              onConfirm={onConfirm}
            />
          ) : null
        }
      />

      <Modal
        visible={showConfirm && !confirmHasPriorStep}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onCancelConfirm}
      >
        {pendingName ? (
          <ConfirmBody
            pendingName={pendingName}
            billed={null}
            confirming={confirming}
            showPlan={false}
            onBack={onCancelConfirm}
            onConfirm={onConfirm}
          />
        ) : null}
      </Modal>

      <PartyCreateSuccessModal
        visible={!!successName}
        kind="client"
        title={
          created
            ? `${successName} added`
            : `Tagged ${successName ?? "party"}`
        }
        message={
          created
            ? billed
              ? `Saved in Self and tagged. AR for this trip is ${formatInr(billed)}.`
              : "Saved in Self and tagged to this trip. Receivables will show under this party."
            : billed
              ? `This trip now sits under that party’s AR at ${formatInr(billed)}.`
              : "This trip now sits under that party’s receivables. Collect uses this party."
        }
        onOk={onSuccessOk}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 22,
    justifyContent: "center",
    gap: 10,
  },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  planItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  planLine: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.surfaceBorder,
    marginRight: 6,
  },
  planLineOn: {
    backgroundColor: Theme.driverEmerald,
  },
  planDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  planDotOn: {
    backgroundColor: Theme.driverEmerald,
    borderColor: Theme.driverEmerald,
  },
  planNum: {
    ...driverUIBold,
    fontSize: 10,
    color: Theme.textMuted,
  },
  planNumOn: {
    color: Theme.textOnPrimary,
  },
  planLabel: {
    ...driverUISemiBold,
    fontSize: 11,
    color: Theme.textMuted,
  },
  planLabelOn: {
    color: Theme.textPrimary,
  },
  kicker: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  title: {
    ...driverUIBold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  body: {
    ...driverBodySecondary,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  summary: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  summaryCol: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  summaryLabel: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  summaryValue: {
    ...driverUIBold,
    marginTop: 2,
    fontSize: 16,
    color: Theme.textPrimary,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  backBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    ...driverUIBold,
    fontSize: 15,
    color: Theme.textPrimary,
  },
  goBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Theme.driverEmerald,
    alignItems: "center",
    justifyContent: "center",
  },
  goDisabled: {
    opacity: 0.45,
  },
  goText: {
    ...driverUIBold,
    fontSize: 15,
    color: Theme.textOnPrimary,
  },
});
