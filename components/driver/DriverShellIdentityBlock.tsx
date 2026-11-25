/**
 * Shared driver-tab identity: avatar + pulsepilot. + screen title.
 * Keeps Home / Wallet / Trips / Control / etc. optically aligned.
 */
import { DriverBrandMark } from "@/components/driver/DriverBrandMark";
import { DriverSelfAvatar } from "@/components/driver/DriverSelfAvatar";
import Layout from "@/constants/Layout";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  avatarUri: string;
  title: string;
  titleColor: string;
  brandColor: string;
  avatarBorderColor: string;
  onPressAvatar?: () => void;
};

export function DriverShellIdentityBlock({
  avatarUri,
  title,
  titleColor,
  brandColor,
  avatarBorderColor,
  onPressAvatar,
}: Props) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={
          onPressAvatar ?? (() => router.push("/(driver)/profile"))
        }
        style={styles.avatarHit}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Profile"
        accessibilityHint="Opens your driver profile"
      >
        <DriverSelfAvatar
          size={Layout.driverHeaderAvatarSize}
          uri={avatarUri}
          borderColor={avatarBorderColor}
        />
      </TouchableOpacity>
      <View style={styles.copy}>
        <DriverBrandMark color={brandColor} style={styles.brand} />
        <Text
          style={[styles.title, { color: titleColor }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  avatarHit: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  brand: {
    marginBottom: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 18,
  },
});
