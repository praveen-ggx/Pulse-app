import Theme from "@/constants/Theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type InvoiceCreationStage = "select" | "configure" | "review" | "issue";

const STAGES: { key: InvoiceCreationStage; label: string }[] = [
  { key: "select", label: "1  Select trips" },
  { key: "configure", label: "2  Configure" },
  { key: "review", label: "3  Review" },
  { key: "issue", label: "4  Issue" },
];

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function InvoiceCreationStepper({
  stage,
  onStage,
  eligibleCount,
  blockedCount,
  freight,
  policyLabel,
  canLeaveSelect,
}: {
  stage: InvoiceCreationStage;
  onStage: (next: InvoiceCreationStage) => void;
  eligibleCount: number;
  blockedCount: number;
  freight: number;
  policyLabel: string;
  canLeaveSelect: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.steps} accessibilityRole="tablist">
        {STAGES.map((item) => {
          const active = item.key === stage;
          const blocked =
            item.key !== "select" && !canLeaveSelect;
          return (
            <Pressable
              key={item.key}
              style={[styles.step, active && styles.stepActive]}
              disabled={blocked}
              onPress={() => onStage(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: blocked }}
              accessibilityLabel={item.label}
            >
              <Text style={[styles.stepText, active && styles.stepTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.summary}>
        {eligibleCount} eligible · {blockedCount} blocked · {inr(freight)} freight
        {"  ·  "}
        {policyLabel}
      </Text>
    </View>
  );
}

export function InvoiceCreationStageBody({
  stage,
  clientName,
  policyLabel,
  policyUnconfigured,
  eligibleCount,
  blockedCount,
  freight,
  blockedHint,
  onBack,
  onContinue,
}: {
  stage: Exclude<InvoiceCreationStage, "select">;
  clientName: string;
  policyLabel: string;
  policyUnconfigured: boolean;
  eligibleCount: number;
  blockedCount: number;
  freight: number;
  blockedHint: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const title =
    stage === "configure"
      ? "Invoice configuration"
      : stage === "review"
        ? "Review the invoice"
        : "Issue the invoice";
  const body =
    stage === "configure"
      ? "Payment terms, GST rate, and due date stay on the invoice preview. They come from this client’s invoice format and the company GST profile. An unconfigured POD policy is not treated as optional."
      : stage === "review"
        ? "The preview on the right is the invoice that will be saved. Save draft stores these totals. Issue uses the same totals."
        : "Issue sends this preview through the invoice issuance service. Submitting twice reuses the same idempotency key.";
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardClient}>{clientName}</Text>
      <Text style={styles.cardMeta}>{policyLabel}</Text>
      <Text style={styles.cardMeta}>
        {eligibleCount} trip{eligibleCount === 1 ? "" : "s"} · {inr(freight)} freight
      </Text>
      {blockedCount > 0 ? (
        <Text style={styles.cardWarn}>
          {blockedCount} selected trip{blockedCount === 1 ? "" : "s"} stay off this invoice.
          {blockedHint ? ` ${blockedHint}` : ""}
        </Text>
      ) : null}
      {policyUnconfigured ? (
        <Text style={styles.cardWarn}>
          Set this client’s POD policy before issuing. No policy is not the same as POD not required.
        </Text>
      ) : null}
      <Text style={styles.cardBody}>{body}</Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.secondary}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
        {stage !== "issue" ? (
          <Pressable
            style={[styles.primary, (policyUnconfigured || eligibleCount === 0) && styles.primaryDisabled]}
            disabled={policyUnconfigured || eligibleCount === 0}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel={stage === "configure" ? "Continue to review" : "Continue to issue"}
          >
            <Text style={styles.primaryText}>
              {stage === "configure" ? "Continue to review" : "Continue to issue"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  steps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  step: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  stepActive: {
    borderColor: Theme.brandBlue,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  stepText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  stepTextActive: {
    color: Theme.textPrimaryDark,
  },
  summary: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  card: {
    margin: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  cardClient: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  cardMeta: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  cardWarn: {
    fontSize: 13,
    color: Theme.warning,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  primary: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: Theme.primary,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.cardWhite,
  },
});
