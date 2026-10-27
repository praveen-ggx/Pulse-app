import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";

/**
 * Full-width notice that hub counts are approximate. Kept out of the toolbar count
 * chip, which is width-capped and single-line, so the whole message stays readable.
 */
export function HubPartialWarning({ message }: { message?: string | null }) {
  const text = (message ?? "").trim();
  if (!text) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel={text}>
      <FontAwesome name="exclamation-triangle" size={12} color={Theme.warning} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.warningMuted,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.warning,
  },
});
