import Theme from "@/constants/Theme";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * One document number, or the first few plus a control that opens the rest.
 * Table stays one line until opened. The card shows two, then the rest.
 */
export function ComplianceNumberStack({
  numbers,
  variant,
}: {
  numbers: string[];
  variant: "table" | "card";
}) {
  const [open, setOpen] = useState(false);
  const previewCount = variant === "card" ? 2 : 1;

  if (numbers.length === 0) {
    if (variant === "card") return null;
    return <Text style={styles.tableNumber}>—</Text>;
  }

  const shown = open ? numbers : numbers.slice(0, previewCount);
  const hidden = numbers.length - shown.length;

  return (
    <View style={variant === "card" ? styles.cardWrap : styles.tableWrap}>
      {shown.map((number, index) => (
        <Text
          key={`${number}-${index}`}
          style={variant === "card" ? styles.cardNumber : styles.tableNumber}
          numberOfLines={1}
          selectable
        >
          {number}
        </Text>
      ))}
      {numbers.length > previewCount ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            setOpen((value) => !value);
          }}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={
            open ? "Show fewer numbers" : `${hidden} more: ${numbers.slice(shown.length).join(", ")}`
          }
        >
          <Text style={styles.more}>{open ? "Show less" : `+${hidden}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tableWrap: { minWidth: 0, gap: 1 },
  cardWrap: { minWidth: 0, gap: 1, marginTop: 1 },
  tableNumber: { fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  cardNumber: { fontSize: 10, fontWeight: "600", lineHeight: 13, color: Theme.textPrimaryDark },
  more: {
    alignSelf: "flex-start",
    marginTop: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: Theme.complianceStageInfoBg,
    color: Theme.complianceStageInfoFg,
    fontSize: 9,
    fontWeight: "700",
  },
});
