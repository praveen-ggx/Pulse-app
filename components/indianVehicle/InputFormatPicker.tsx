/**
 * Row of format chips above a licence / plate field. The first option is the
 * default (standard) layout; picking another one switches the typing mask.
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
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {opt.label}
            </Text>
            <Text style={styles.example}>{opt.example}</Text>
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  labelSelected: {
    color: Theme.primary,
  },
  example: {
    fontSize: 11,
    color: Theme.textMuted,
  },
});
