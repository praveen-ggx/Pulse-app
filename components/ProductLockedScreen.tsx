import { Lock } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";

type Props = {
  productName: string;
};

export function ProductLockedScreen({ productName }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.iconWell} accessibilityLabel={`${productName} locked`}>
        <Lock size={28} color={Theme.textMuted} strokeWidth={2} />
      </View>
      <Text style={styles.title}>{productName}</Text>
      <Text style={styles.body}>This product is locked and is not available.</Text>
      <Pressable
        onPress={() => router.replace(ROUTES.TABS.TRIPS as never)}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
        accessibilityLabel="Back to trips"
      >
        <Text style={styles.ctaText}>Back to trips</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: Theme.screenBackground,
    gap: 10,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.analyticsCanvas,
    borderWidth: 1,
    borderColor: "rgba(77, 54, 54, 0.1)",
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
  cta: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
});
