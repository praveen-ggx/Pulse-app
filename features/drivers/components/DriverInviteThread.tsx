/**
 * Simple chat-style thread for a fleet ↔ driver invite negotiation.
 * Built from driver_invite_rounds: every round with a message becomes a bubble;
 * a fleet round that changed the pay also shows "Offer updated: …".
 */
import Theme from "@/constants/Theme";
import {
  formatInvitePayLine,
  type DriverInviteRound,
} from "@/features/drivers/services/driverInviteNegotiation.service";
import { Linking, StyleSheet, Text, View } from "react-native";

/** Indian / international phone numbers inside a message (10+ digits). */
const PHONE_RE = /(\+?\d[\d\s-]{8,}\d)/g;

/** Message text with phone numbers as tap-to-call links. */
function MessageText({ text }: { text: string }) {
  const parts = text.split(PHONE_RE);
  return (
    <Text style={styles.text}>
      {parts.map((part, i) => {
        const digits = part.replace(/[^\d+]/g, "");
        const isPhone = i % 2 === 1 && digits.replace("+", "").length >= 10;
        if (!isPhone) return <Text key={i}>{part}</Text>;
        return (
          <Text
            key={i}
            style={styles.phone}
            onPress={() => void Linking.openURL(`tel:${digits}`).catch(() => undefined)}
            accessibilityRole="link"
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

type Props = {
  rounds: DriverInviteRound[];
  /** Who is looking: their own bubbles show on the right as "You". */
  viewer: "fleet" | "driver";
  fleetName: string;
  driverName: string;
};

function samePay(a: DriverInviteRound | undefined, b: DriverInviteRound): boolean {
  if (!a) return true;
  return (
    Number(a.payable_amount ?? 0) === Number(b.payable_amount ?? 0) &&
    Number(a.commission_percent ?? 0) === Number(b.commission_percent ?? 0) &&
    Number(a.commission_per_km ?? 0) === Number(b.commission_per_km ?? 0)
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DriverInviteThread({ rounds, viewer, fleetName, driverName }: Props) {
  const items = rounds
    .map((round, i) => {
      const prev = rounds[i - 1];
      const payChanged = round.by_side === "fleet" && i > 0 && !samePay(prev, round);
      return { round, payChanged };
    })
    .filter(({ round, payChanged }) => !!round.note?.trim() || payChanged);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {items.map(({ round, payChanged }) => {
        const mine = round.by_side === viewer;
        const who = mine ? "You" : round.by_side === "fleet" ? fleetName : driverName;
        return (
          <View
            key={`${round.round_no}-${round.created_at}`}
            style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}
          >
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={styles.who}>
                {who} · {timeLabel(round.created_at)}
              </Text>
              {round.note?.trim() ? <MessageText text={round.note.trim()} /> : null}
              {payChanged ? (
                <Text style={styles.offer}>Offer updated: {formatInvitePayLine(round)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginVertical: 6 },
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "88%", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  bubbleMine: { backgroundColor: "rgba(16,185,129,0.12)", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "rgba(15,23,42,0.06)", borderBottomLeftRadius: 4 },
  who: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  text: { fontSize: 14, color: Theme.textPrimary, lineHeight: 19 },
  phone: { color: Theme.driverEmerald, fontWeight: "700", textDecorationLine: "underline" },
  offer: { fontSize: 12, fontWeight: "700", color: Theme.driverEmerald, marginTop: 2 },
});
