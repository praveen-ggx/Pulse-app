/**
 * Tappable Notes row for odometer entry — opens FullscreenTextEntry.
 */
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FullscreenTextEntry } from "@/components/mobile-input/FullscreenTextEntry";
import Theme from "@/constants/Theme";

type Props = {
  value: string;
  onChange: (next: string) => void;
  contextLine?: string;
};

export function OdometerNotesField({ value, onChange, contextLine }: Props) {
  const [open, setOpen] = useState(false);
  const trimmed = value.trim();
  const hasNote = trimmed.length > 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: Theme.cardWhite,
            borderColor: Theme.borderLight,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={hasNote ? "Edit notes" : "Add note"}
      >
        <View style={styles.copy}>
          <Text style={styles.label}>NOTES</Text>
          <Text
            style={[styles.preview, !hasNote && styles.previewEmpty]}
            numberOfLines={2}
          >
            {hasNote ? trimmed : "Add note (optional)"}
          </Text>
        </View>
        <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
      </Pressable>

      <FullscreenTextEntry
        visible={open}
        onClose={() => setOpen(false)}
        onSubmit={(next) => {
          onChange(next);
          setOpen(false);
        }}
        initialValue={value}
        label="Notes"
        contextLine={contextLine ?? "Odometer reading"}
        placeholder="Correction, issue, or remark"
        submitLabel="Done"
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 52,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  preview: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  previewEmpty: {
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
