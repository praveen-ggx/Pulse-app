import { useMemo, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Search, X, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

export type PartyFilterKindOption<K extends string> = {
  id: K;
  label: string;
  allLabel: string;
  hint: string;
  icon: LucideIcon;
};

export type PartyFilterChoice = {
  id: string;
  name: string;
  meta: string;
  avatar?: ReactNode;
};

type Props<K extends string> = {
  visible: boolean;
  title: string;
  desktop: boolean;
  options: readonly PartyFilterKindOption<K>[];
  kind: K | null;
  onKindChange: (kind: K) => void;
  showKinds?: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  choices: readonly PartyFilterChoice[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  emptyLabel?: string;
  searchPlaceholder?: string;
};

const AVATAR = 28;

export function PartyFilterSheet<K extends string>({
  visible,
  title,
  desktop,
  options,
  kind,
  onKindChange,
  showKinds = true,
  query,
  onQueryChange,
  choices,
  selectedId,
  onSelect,
  onClose,
  emptyLabel = "None on this list",
  searchPlaceholder,
}: Props<K>) {
  const insets = useSafeAreaInsets();
  const meta = options.find((option) => option.id === kind) ?? null;
  const listLabel = useMemo(() => {
    const count = choices.length;
    return `${count} on this list`;
  }, [choices.length]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={desktop ? styles.backdropDesktop : styles.backdropMobile}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filter"
        />
        <View
          style={[
            desktop ? styles.panelDesktop : styles.panelMobile,
            !desktop && { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          {desktop ? null : <View style={styles.handle} />}
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.hint}>{meta?.hint ?? "Pick a party, then choose a name"}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.close}
              hitSlop={Layout.touchTargetHitSlop}
              accessibilityRole="button"
              accessibilityLabel="Close filter"
            >
              <X size={14} color={Theme.textRouteCard} strokeWidth={2.2} />
            </Pressable>
          </View>
          {showKinds ? (
            <View style={styles.kindRow}>
              {options.map((option) => {
                const selected = kind === option.id;
                const Icon = option.icon;
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.kindCard, selected && styles.kindCardOn]}
                    onPress={() => onKindChange(option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.kindIcon, selected && styles.kindIconOn]}>
                      <Icon
                        size={14}
                        color={selected ? Theme.buttonPrimaryText : Theme.primary}
                        strokeWidth={2.2}
                      />
                    </View>
                    <Text style={[styles.kindLabel, selected && styles.kindLabelOn]} numberOfLines={1}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={[styles.search, kind == null && styles.searchIdle]}>
            <Search size={13} color={Theme.textMuted} />
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              editable={kind != null}
              placeholder={
                searchPlaceholder ??
                (meta ? `Search ${meta.label.toLowerCase()}s` : "Choose a party first")
              }
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => onQueryChange("")} hitSlop={8} accessibilityLabel="Clear search">
                <X size={13} color={Theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            style={styles.list}
            contentContainerStyle={desktop ? styles.grid : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {kind && meta ? (
              <View style={desktop ? styles.cell : styles.cellStack}>
                <Pressable
                  style={[styles.choice, selectedId == null && styles.choiceOn]}
                  onPress={() => onSelect(null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedId == null }}
                >
                  <View style={styles.allMark}>
                    <Text style={styles.allMarkText}>All</Text>
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.name} numberOfLines={1}>
                      {meta.allLabel}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {listLabel}
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
            {choices.map((choice) => {
              const selected = selectedId === choice.id;
              return (
                <View key={choice.id} style={desktop ? styles.cell : styles.cellStack}>
                  <Pressable
                    style={[styles.choice, selected && styles.choiceOn]}
                    onPress={() => onSelect(choice.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    {choice.avatar ?? <FallbackMark name={choice.name} />}
                    <View style={styles.copy}>
                      <Text style={styles.name} numberOfLines={1}>
                        {choice.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {choice.meta}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
            {kind && choices.length === 0 ? <Text style={styles.empty}>{emptyLabel}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FallbackMark({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View style={styles.allMark}>
      <Text style={styles.allMarkText}>{letters || "•"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropDesktop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  backdropMobile: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  panelDesktop: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "76%",
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  panelMobile: {
    maxHeight: "82%",
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: Theme.borderLight,
  },
  handle: {
    alignSelf: "center",
    width: 32,
    height: 3,
    borderRadius: 999,
    backgroundColor: Theme.borderMedium,
    marginBottom: 8,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  headCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  hint: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textRouteCard,
  },
  close: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    marginTop: -8,
    marginRight: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  kindRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  kindCard: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  kindCardOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  kindIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  kindIconOn: {
    backgroundColor: Theme.primary,
  },
  kindLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  kindLabelOn: {
    color: Theme.primary,
  },
  search: {
    marginTop: 10,
    marginBottom: 8,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  searchIdle: {
    opacity: 0.72,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    paddingVertical: 6,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  list: {
    maxHeight: 360,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  cell: {
    width: "50%",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  cellStack: {
    width: "100%",
    paddingBottom: 8,
  },
  choice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  choiceOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  meta: {
    fontSize: 11,
    color: Theme.textRouteCard,
  },
  allMark: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  allMarkText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
  },
  empty: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 12,
    color: Theme.textRouteCard,
  },
});
