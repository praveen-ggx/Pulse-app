/**
 * Identity boundary and award → execution handoff for a pooled opportunity.
 * The pool screen never shows shipper identity. Identity becomes eligible to
 * open only after the shipper accepts a bid and the Marketplace fee gate
 * clears; the details themselves live in My Bids, which the backend unmasks
 * on the same condition. Execution is the existing per-load path, unchanged.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { FeePaymentStatus } from "@/features/network/services/findLoadsForOrg.service";
import { poolIdentityGate } from "@/features/network/utils/pooledOpportunity.util";
import { ChevronRight, Lock } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

const WEB_COPY = Platform.select({
  web: { whiteSpace: "pre-wrap" } as object,
  default: {},
});

type Step = { label: string; detail: string; done: boolean };

export function PoolHandoffPanel({
  awardedBids,
  onOpenAwarded,
}: {
  awardedBids: { indent_id: string; fee_payment_status: FeePaymentStatus }[];
  onOpenAwarded: () => void;
}) {
  const gate = poolIdentityGate(awardedBids);

  if (gate.state === "hidden") {
    return (
      <View style={styles.wrap} testID="pool-identity-gate-hidden">
        <View style={styles.lockRow}>
          <Lock size={14} color={Theme.textMuted} strokeWidth={2.4} />
          <Text style={styles.eyebrow}>SHIPPER IDENTITY HIDDEN</Text>
        </View>
        <Text style={styles.stepDetail}>
          Marketplace keeps shippers anonymous while you bid. Identity opens only
          after the shipper accepts your bid and the Marketplace fee clears.
        </Text>
      </View>
    );
  }

  const total = gate.awarded;
  const steps: Step[] = [
    {
      label: "Accepted by shipper",
      detail: `${total} load${total === 1 ? "" : "s"} from this pool`,
      done: true,
    },
    {
      label: "Marketplace fee",
      detail: `${gate.eligible} of ${total} cleared`,
      done: gate.eligible === total,
    },
    {
      label: "Shipper identity",
      detail:
        gate.state === "eligible"
          ? `Available in My Bids for ${gate.eligible} awarded load${gate.eligible === 1 ? "" : "s"}`
          : "Locked — pending commercial acceptance",
      done: gate.state === "eligible",
    },
    {
      label: "Assign vehicle & driver",
      detail: "Creates the trip for each awarded load",
      done: false,
    },
    {
      label: "Driver job card",
      detail: "Driver runs stops, proof of delivery and completion",
      done: false,
    },
  ];

  return (
    <View
      style={[styles.wrap, styles.wrapAwarded]}
      testID={`pool-identity-gate-${gate.state}`}
    >
      <Text style={styles.eyebrow}>AWARD & EXECUTION</Text>
      <Text style={styles.title}>From award to trip</Text>
      {steps.map((step, i) => (
        <View key={step.label} style={styles.step}>
          <View style={[styles.dot, step.done && styles.dotDone]}>
            <Text style={[styles.dotText, step.done && styles.dotTextDone]}>
              {i + 1}
            </Text>
          </View>
          <View style={styles.stepBody}>
            <Text style={styles.stepLabel}>{step.label}</Text>
            <Text style={styles.stepDetail}>{step.detail}</Text>
          </View>
        </View>
      ))}
      <Pressable
        onPress={onOpenAwarded}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open awarded loads"
      >
        <Text style={styles.ctaText}>Open awarded loads</Text>
        <ChevronRight size={14} color={Theme.positive} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    padding: 20,
    gap: 10,
  },
  wrapAwarded: { borderColor: Theme.positiveMutedDarkBorder },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: Theme.positive, borderColor: Theme.positive },
  dotText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  dotTextDone: { color: Theme.textOnPrimary },
  stepBody: { flex: 1, minWidth: 0 },
  stepLabel: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  stepDetail: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
    ...WEB_COPY,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    backgroundColor: Theme.positiveMuted,
  },
  ctaPressed: { opacity: 0.88 },
  ctaText: { fontSize: 14, fontWeight: "700", color: Theme.positive },
});
