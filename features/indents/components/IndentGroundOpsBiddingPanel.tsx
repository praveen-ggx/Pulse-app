/**
 * Review Hub bids pane for Ground Ops: where the load stands, never the money
 * (no bid amounts, rates, margins or bid counts). Bidding and award stay with
 * Trip Ops; Ground Ops pick the load up once it becomes a trip.
 */
import { Gavel, Lock, Truck } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

function stageFor(statusLower: string): { label: string; body: string; done: boolean } {
  if (["awarded", "deployed", "completed"].includes(statusLower)) {
    return {
      label: "Awarded",
      body: "A supplier has been chosen. The trip will appear in your Document Upload once a driver and truck are assigned.",
      done: true,
    };
  }
  if (statusLower === "cancelled") {
    return { label: "Cancelled", body: "This load was cancelled. Nothing to do.", done: true };
  }
  if (statusLower === "draft") {
    return { label: "Draft", body: "This load has not been posted yet.", done: false };
  }
  return {
    label: "Bidding in progress",
    body: "Trip Ops are collecting and awarding bids. You'll see the trip once it is assigned.",
    done: false,
  };
}

export function IndentGroundOpsBiddingHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.headerBar} />
      <Text style={styles.headerTitle}>Bidding</Text>
    </View>
  );
}

export function IndentGroundOpsBiddingPanel({ statusLower }: { statusLower: string }) {
  const stage = stageFor(statusLower);
  const Icon = stage.done ? Truck : Gavel;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Icon size={20} color={Theme.primary} strokeWidth={2.2} />
      </View>
      <Text style={styles.stage}>{stage.label}</Text>
      <Text style={styles.body}>{stage.body}</Text>
      <View style={styles.note}>
        <Lock size={12} color={Theme.textMuted} strokeWidth={2.2} />
        <Text style={styles.noteText}>Rates and bids are visible to Trip Ops and Finance only.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: Theme.positive,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  card: {
    alignItems: "center",
    gap: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  stage: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textRouteCard,
    textAlign: "center",
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  noteText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
});
