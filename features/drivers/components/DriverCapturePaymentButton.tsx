import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import type { DriverCaptureLane } from "@/features/drivers/utils/driverCapturePayment.util";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

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
  label = "Capture",
  allowZeroDue = false,
}: Props) {
  const router = useRouter();
  if (!tripId) return null;
  if (due <= 0 && !allowZeroDue) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        block && styles.btnBlock,
        disabled && styles.btnDisabled,
        !disabled && pressed ? styles.btnPressed : null,
      ]}
      onPress={() =>
        router.push(
          ROUTES.driverCapturePayment({
            tripId,
            due,
            lane,
            partyName,
            mode,
            reference,
          }) as Href,
        )
      }
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`${label} payment`}
    >
      <Text style={[styles.text, compact && styles.textCompact, block && styles.textBlock]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 26,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.actionBtnInk,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCompact: {
    height: 26,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  btnBlock: {
    flex: 1,
    height: 44,
    minHeight: 44,
    minWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  textBlock: {
    fontSize: 13,
    fontWeight: "700",
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  text: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.buttonDarkText,
  },
  textCompact: {
    fontSize: 10,
  },
});
