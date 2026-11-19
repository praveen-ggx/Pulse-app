import { ActivityIndicator, Pressable, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { getDriverThemeColors } from "@/contexts/DriverThemeContext";

import { driverOpsEntryStyles as ops } from "./driverOpsEntry.styles";

type Props = {
  cancelLabel?: string;
  onCancel: () => void;
  saveLabel: string;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  hint?: string | null;
  /** Odometer entry uses a wider sage save button. Expense flows stay on the default split. */
  emphasis?: "default" | "odometer";
};

/** Footer actions shared by driver expense + odometer entry flows. */
export function DriverOpsEntryFooter({
  cancelLabel = "Cancel",
  onCancel,
  saveLabel,
  onSave,
  saving = false,
  saveDisabled = false,
  hint,
  emphasis = "default",
}: Props) {
  const colors = getDriverThemeColors("light");
  const disabled = saving || saveDisabled;
  const odometer = emphasis === "odometer";

  return (
    <View style={ops.footer}>
      {hint ? (
        <Text style={[ops.syncHint, { color: colors.textMuted, width: "100%", marginBottom: 6 }]}>
          {hint}
        </Text>
      ) : null}
      <Pressable
        style={[
          ops.skipBtn,
          { borderColor: colors.border, backgroundColor: colors.surface },
          odometer && { flex: 0.38, borderRadius: 12 },
        ]}
        onPress={onCancel}
        disabled={saving}
      >
        <Text style={[ops.skipText, { color: colors.textMuted }]}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        style={[
          ops.saveBtn,
          { backgroundColor: odometer ? Theme.odometerSaveFill : colors.emeraldDark },
          odometer && { flex: 0.62, borderRadius: 12 },
          disabled && { opacity: 0.5 },
        ]}
        onPress={onSave}
        disabled={disabled}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={ops.saveText}>{saveLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}
