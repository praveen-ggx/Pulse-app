import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ChevronRight } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { VehicleTypeCatalogSheet } from "@/features/vehicles/components/VehicleTypeCatalogSheet";

type Props = {
  /** Stored vehicle type ("Open 20 Feet" or a legacy free-text value). */
  value: string;
  /** New catalog value ("" when cleared) and the picked passing ton label. */
  onChange: (value: string, passingTon: string | null) => void;
  /** Current load tons / capacity, used to preselect the passing ton. */
  tons?: string;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
  /** Replaces the default box style (pass the screen's own input style). */
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/** Tap-to-pick vehicle type field backed by the global catalog sheet. */
export function VehicleTypeCatalogField({
  value,
  onChange,
  tons,
  placeholder = "Select vehicle type",
  hasError = false,
  disabled = false,
  style,
  textStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasValue = value.trim().length > 0;

  return (
    <>
      <Pressable
        style={[
          styles.box,
          style,
          styles.row,
          hasError && styles.boxError,
          disabled && styles.boxDisabled,
        ]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={hasValue ? `Vehicle type ${value}` : placeholder}
      >
        <Text
          style={[styles.text, textStyle, !hasValue && styles.placeholder]}
          numberOfLines={1}
        >
          {hasValue ? value : placeholder}
        </Text>
        <ChevronRight size={18} color={Theme.iconPrimary} />
      </Pressable>
      <VehicleTypeCatalogSheet
        visible={open}
        value={value}
        tons={tons}
        onClose={() => setOpen(false)}
        onChange={onChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    ...Platform.select({ web: { cursor: "pointer" as const }, default: {} }),
  },
  boxError: {
    borderColor: Theme.negative,
  },
  boxDisabled: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  placeholder: {
    fontWeight: "400",
    color: Theme.placeholder,
  },
});
