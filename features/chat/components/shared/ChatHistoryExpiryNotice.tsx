import {
  slackDesktopStyles as deskSt,
} from "@/features/chat/components/desktop/chatSlackDesktop.styles";
import {
  slackMobileStyles as mobileSt,
} from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { StyleSheet, Text, View } from "react-native";

const TRIP_NOTICE =
  "Chat history expires 30 days from the date of delivery.";

/** DMs keep every message; only files shared in chat are time-limited. */
export const DM_RETENTION_NOTICE = "Messages are kept · Files are kept for 30 days";

type Props = {
  variant?: "mobile" | "desktop";
  slackLayout?: boolean;
  /** Persistent DM threads keep messages; show the DM file notice instead. */
  persistent?: boolean;
};

export function ChatHistoryExpiryNotice({
  variant = "mobile",
  slackLayout = false,
  persistent = false,
}: Props) {
  const notice = persistent ? DM_RETENTION_NOTICE : TRIP_NOTICE;

  if (slackLayout) {
    const styles = variant === "desktop" ? deskSt : mobileSt;
    return (
      <View style={styles.threadExpiryNotice}>
        <Text style={styles.threadExpiryNoticeText}>{notice}</Text>
      </View>
    );
  }

  return (
    <View style={legacyStyles.wrap}>
      <Text style={legacyStyles.text}>{notice}</Text>
    </View>
  );
}

const legacyStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: "#94a3b8",
    textAlign: "center",
  },
});
