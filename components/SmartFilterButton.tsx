/**
 * Toolbar pill that opens the same sheet as Filter trips.
 * The cards choose what the list is (date, type, status); the list is that card's choices.
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { LucideIcon } from "lucide-react-native";

import { PartyFilterSheet, type PartyFilterChoice } from "@/components/PartyFilterSheet";
import Theme from "@/constants/Theme";

export type SmartFilterKind<K extends string> = {
  id: K;
  label: string;
  allLabel: string;
  hint: string;
  icon: LucideIcon;
  /** null means the "All" row is the current choice. */
  selectedId: string | null;
  choices: readonly PartyFilterChoice[];
  searchPlaceholder?: string;
};

type Props<K extends string> = {
  title: string;
  triggerLabel: string;
  triggerActive?: boolean;
  kinds: readonly SmartFilterKind<K>[];
  kind: K;
  onKindChange: (kind: K) => void;
  onSelect: (kind: K, id: string | null) => void;
};

export function SmartFilterButton<K extends string>({
  title,
  triggerLabel,
  triggerActive = false,
  kinds,
  kind,
  onKindChange,
  onSelect,
}: Props<K>) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const active = kinds.find((item) => item.id === kind) ?? kinds[0];
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!active) return [];
    if (!q) return active.choices;
    return active.choices.filter(
      (choice) =>
        choice.name.toLowerCase().includes(q) || choice.meta.toLowerCase().includes(q),
    );
  }, [active, query]);

  if (!active) return null;

  return (
    <View>
      <Pressable
        style={[styles.trigger, triggerActive && styles.triggerOn]}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityState={{ expanded: open }}
      >
        <FontAwesome
          name="filter"
          size={11}
          color={triggerActive ? Theme.primary : Theme.textRouteCard}
        />
        <Text
          style={[styles.triggerText, triggerActive && styles.triggerTextOn]}
          numberOfLines={1}
        >
          {triggerLabel}
        </Text>
        <FontAwesome
          name="chevron-down"
          size={9}
          color={triggerActive ? Theme.primary : Theme.textRouteCard}
        />
      </Pressable>
      <PartyFilterSheet
        visible={open}
        title={title}
        desktop={desktop}
        showKinds={kinds.length > 1}
        options={kinds}
        kind={active.id}
        onKindChange={(next) => {
          setQuery("");
          onKindChange(next);
        }}
        query={query}
        onQueryChange={setQuery}
        choices={choices}
        selectedId={active.selectedId}
        onSelect={(id) => {
          onSelect(active.id, id);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        searchPlaceholder={active.searchPlaceholder ?? `Search ${active.label.toLowerCase()}`}
        emptyLabel="Nothing matches"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  triggerOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  triggerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  triggerTextOn: {
    color: Theme.primary,
  },
});
