import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { DM_RETENTION_NOTICE } from "@/features/chat/components/shared/ChatHistoryExpiryNotice";
import { MessageSquare, RotateCw } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type DmThreadStatus = "loading" | "ready" | "error";

type Props = {
  status: DmThreadStatus;
  partnerName: string;
  onRetry?: () => void;
};

/** Shown in a DM with no messages on screen: loading, failed load, or a new conversation. */
export function DmThreadEmptyState({ status, partnerName, onRetry }: Props) {
  if (status === "loading") {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite">
        <LoadingIndicator size="small" color={Theme.textSecondary} />
        <Text style={styles.body}>Loading messages…</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite">
        <Text style={styles.title}>Couldn’t load messages</Text>
        <Text style={styles.body}>
          Your conversation with {partnerName} is safe. Check your connection and try again.
        </Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading messages"
            hitSlop={8}
          >
            <RotateCw size={14} color={Theme.textPrimaryDark} strokeWidth={2.2} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <MessageSquare size={20} color={Theme.textPrimaryDark} strokeWidth={1.85} />
      </View>
      <Text style={styles.title}>No messages yet</Text>
      <Text style={styles.body}>Start the conversation with {partnerName}.</Text>
      <Text style={styles.note}>{DM_RETENTION_NOTICE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  note: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
    textAlign: "center",
  },
  retry: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  pressed: { opacity: 0.7 },
});
