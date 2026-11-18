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
      <View style={styles.note} testID="pool-identity-gate-hidden">
        <View style={styles.lockMark}>
          <Lock size={15} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </View>
        <View style={styles.noteCopy}>
          <Text style={styles.noteTitle}>Shipper identity hidden</Text>
          <Text style={styles.noteBody}>
            Shippers stay anonymous on the Marketplace while you bid. You see a
            shipper's name only after they accept your bid and the Marketplace fee
            is paid.
          </Text>
        </View>
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
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 8,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  wrapAwarded: { borderColor: Theme.positiveMutedDarkBorder },
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
    color: Theme.textRouteCard,
    lineHeight: 18,
    ...WEB_COPY,
  },
  note: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  lockMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  noteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 1,
  },
  noteTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    ...WEB_COPY,
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: Theme.textPrimary,
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
