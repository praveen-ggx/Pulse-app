import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import Theme from "@/constants/Theme";

type Props = {
  label: string;
  align?: "left" | "right";
  active: boolean;
  sortDirection: "asc" | "desc" | null;
  choices: readonly { value: string; count: number }[];
  selected: readonly string[] | null;
  onChange: (selected: readonly string[] | null) => void;
  onSort: (direction: "asc" | "desc") => void;
  style?: object;
  tone?: "dark" | "light";
};

export function TripExcelColumnHeader({
  label,
  align = "left",
  active,
  sortDirection,
  choices,
  selected,
  onChange,
  onSort,
  style,
  tone = "dark",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const picked = useMemo(() => new Set(selected ?? choices.map((choice) => choice.value)), [choices, selected]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return choices;
    return choices.filter((choice) => choice.value.toLowerCase().includes(needle));
  }, [choices, query]);
  const allVisibleOn = visible.length > 0 && visible.every((choice) => picked.has(choice.value));

  const commit = (next: Set<string>) => {
    if (choices.length > 0 && choices.every((choice) => next.has(choice.value))) {
      onChange(null);
      return;
    }
    onChange([...next]);
  };

  return (
    <View style={style}>
      <Pressable
        style={[
          styles.head,
          tone === "light" && styles.headLight,
          tone === "light" && { borderColor: active ? Theme.primary : Theme.border },
          align === "right" && styles.headRight,
        ]}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Filter ${label}`}
      >
        <Text
          style={[styles.label, tone === "light" && styles.labelLight, align === "right" && styles.labelRight]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <FontAwesome
          name={sortDirection === "asc" ? "sort-asc" : sortDirection === "desc" ? "sort-desc" : "filter"}
          size={9}
          color={tone === "light" ? Theme.primary : Theme.buttonDarkText}
          style={{ opacity: active || sortDirection ? 1 : 0.55 }}
        />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.menuTitle}>{label}</Text>
            <View style={styles.sortRow}>
              <Pressable style={styles.sortBtn} onPress={() => onSort("asc")} accessibilityRole="button" accessibilityLabel={`Sort ${label} ascending`}>
                <Text style={styles.sortText}>A → Z</Text>
              </Pressable>
              <Pressable style={styles.sortBtn} onPress={() => onSort("desc")} accessibilityRole="button" accessibilityLabel={`Sort ${label} descending`}>
                <Text style={styles.sortText}>Z → A</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search values"
              placeholderTextColor={Theme.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Pressable
              style={styles.choice}
              onPress={() => {
                const next = new Set(picked);
                visible.forEach((choice) => {
                  if (allVisibleOn) next.delete(choice.value);
                  else next.add(choice.value);
                });
                commit(next);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allVisibleOn }}
            >
              <Box on={allVisibleOn} />
              <Text style={styles.choiceText}>(Select all)</Text>
            </Pressable>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {visible.map((choice) => {
                const on = picked.has(choice.value);
                return (
                  <Pressable
                    key={choice.value}
                    style={styles.choice}
                    onPress={() => {
                      const next = new Set(picked);
                      if (on) next.delete(choice.value);
                      else next.add(choice.value);
                      commit(next);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Box on={on} />
                    <Text style={styles.choiceText} numberOfLines={1}>
                      {choice.value}
                    </Text>
                    <Text style={styles.count}>{choice.count}</Text>
                  </Pressable>
                );
              })}
              {visible.length === 0 ? <Text style={styles.empty}>No matching values</Text> : null}
            </ScrollView>
            <Pressable
              style={styles.clear}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label} filter`}
            >
              <Text style={styles.clearText}>Clear filter</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <View style={[styles.box, on && styles.boxOn]}>
      {on ? <FontAwesome name="check" size={9} color={Theme.buttonDarkText} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
  },
  headLight: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: Theme.cardWhite,
  },
  headRight: { justifyContent: "flex-end" },
  label: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.buttonDarkText,
    letterSpacing: 0.4,
  },
  labelLight: { color: Theme.textPrimaryDark, letterSpacing: 0 },
  labelRight: { textAlign: "right" },
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menu: {
    width: 320,
    maxWidth: "100%",
    maxHeight: "80%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  sortRow: { flexDirection: "row", gap: 8 },
  sortBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sortText: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  search: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: Theme.textPrimaryDark,
  },
  list: { maxHeight: 280 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
  },
  choiceText: { flex: 1, fontSize: 13, fontWeight: "400", color: Theme.textPrimaryDark },
  count: { fontSize: 12, color: Theme.textMuted },
  empty: { fontSize: 13, color: Theme.textMuted, paddingVertical: 8 },
  box: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  clear: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  clearText: { fontSize: 13, fontWeight: "500", color: Theme.primary },
});
