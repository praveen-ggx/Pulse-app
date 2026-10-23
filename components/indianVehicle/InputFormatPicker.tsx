/**
 * Compact segmented control above a licence / plate field. The first option is
 * the default (standard) layout; picking another one switches the typing mask.
 * Examples are not shown here — the field placeholder shows the picked format.
 */
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

export interface InputFormatOption<T extends string> {
  id: T;
  label: string;
  example: string;
}

export interface InputFormatPickerProps<T extends string> {
  options: readonly InputFormatOption<T>[];
  value: T;
  onChange: (next: T) => void;
  testID?: string;
}

function InputFormatPickerInner<T extends string>({
  options,
  value,
  onChange,
  testID = "input-format-picker",
}: InputFormatPickerProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" testID={testID}>
      {options.map((opt) => {
        const selected = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            hitSlop={6}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${opt.label}, e.g. ${opt.example}`}
            testID={`${testID}-${opt.id}`}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const InputFormatPicker = memo(InputFormatPickerInner) as typeof InputFormatPickerInner;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignSelf: "stretch",
    padding: 3,
    gap: 3,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  labelSelected: {
    color: Theme.primary,
  },
});
