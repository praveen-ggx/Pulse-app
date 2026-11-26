import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import type { DriverCaptureLane } from "@/features/drivers/utils/driverCapturePayment.util";
import { type Href, useRouter } from "expo-router";
import { Banknote } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  tripId: string;
  due: number;
  lane?: DriverCaptureLane;
  partyName?: string;
  mode?: string;
  reference?: string;
  compact?: boolean;
  /** Stretch to fill a row (wallet earnings actions). */
  block?: boolean;
  disabled?: boolean;
  label?: string;
  /** Open capture even when due is 0 (offline trip — add revenue). */
  allowZeroDue?: boolean;
  /** e.g. stopPropagation / close preview before navigating. */
  onPressBeforeNavigate?: () => void;
};

export function DriverCapturePaymentButton({
  tripId,
  due,
  lane,
  partyName,
  mode,
  reference,
  compact,
  block,
  disabled,
  label = "Capture payment",
  allowZeroDue = false,
  onPressBeforeNavigate,
}: Props) {
  const router = useRouter();
  if (!tripId) return null;
  if (due <= 0 && !allowZeroDue) return null;

  const iconSize = compact ? 14 : 15;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        block && styles.btnBlock,
        disabled && styles.btnDisabled,
        !disabled && pressed ? styles.btnPressed : null,
      ]}
      onPress={(event) => {
        event?.stopPropagation?.();
        onPressBeforeNavigate?.();
        router.push(
          ROUTES.driverCapturePayment({
            tripId,
            due,
            lane,
            partyName,
            mode,
            reference,
          }) as Href,
        );
      }}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.inner}>
        <View style={styles.iconWell}>
          <Banknote
            size={iconSize}
            color={Theme.textOnPrimary}
            strokeWidth={2.5}
          />
        </View>
        <Text
          style={[
            styles.text,
            compact && styles.textCompact,
            block && styles.textBlock,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 36,
    minWidth: 44,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Theme.driverPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverEmerald,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  btnCompact: {
    minHeight: 34,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
  },
  btnBlock: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 36,
    minWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minWidth: 0,
  },
  iconWell: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    flexShrink: 0,
  },
  textBlock: {
    fontSize: 12,
    fontWeight: "700",
  },
  btnPressed: {
    opacity: 0.88,
    backgroundColor: Theme.driverEmerald,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  text: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: -0.15,
  },
  textCompact: {
    fontSize: 11,
    fontWeight: "700",
  },
});
