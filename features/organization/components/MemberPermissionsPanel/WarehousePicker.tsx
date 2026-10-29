/**
 * Compact Ground Ops warehouse picker: collapsed summary (count + chips),
 * expands to a searchable list grouped by client with per-client select-all.
 * Chips toggle in place so a long list stays a few rows tall.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import type { OrgWarehouseOption } from "@/features/organization/services/memberWarehouses.service";
import { Check, ChevronDown, Minus, Search, Warehouse } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  options: OrgWarehouseOption[];
  selectedIds: string[];
  isLoading: boolean;
  isError: boolean;
  editable: boolean;
  onToggle: (id: string, next: boolean) => void;
  /** Same picker for Sourcing clients: options carry the client as `name`. */
  kind?: "warehouse" | "client";
};

const MAX_SUMMARY_CHIPS = 3;

export function WarehousePicker({
  options,
  selectedIds,
  isLoading,
  isError,
  editable,
  onToggle,
  kind = "warehouse",
}: Props) {
  const title = kind === "client" ? "Clients" : "Warehouses";
  const noun = kind === "client" ? "clients" : "warehouses";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byClient = new Map<string, OrgWarehouseOption[]>();
    for (const w of options) {
      const client = w.clientName ?? "No client";
      if (q && ![w.name, w.city ?? "", client].some((v) => v.toLowerCase().includes(q))) continue;
      const list = byClient.get(client) ?? [];
      list.push(w);
      byClient.set(client, list);
    }
    return [...byClient.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options, query]);

  const selectedNames = useMemo(
    () => options.filter((w) => selected.has(w.id)).map((w) => w.name),
    [options, selected],
  );

  const summary =
    selectedIds.length === 0
      ? kind === "client"
        ? "None selected"
        : "None selected — they will see no trips"
      : `${selectedIds.length} of ${options.length} selected`;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        <Warehouse size={15} color="#171717" strokeWidth={2} />
        <View style={styles.headCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text
            style={[styles.summary, selectedIds.length === 0 && styles.summaryWarn]}
            numberOfLines={1}
          >
            {summary}
          </Text>
        </View>
        <ChevronDown
          size={15}
          color="#737373"
          strokeWidth={2.2}
          style={open ? styles.chevronOpen : undefined}
        />
      </Pressable>

      {!open && selectedNames.length > 0 ? (
        <View style={styles.chipRow}>
          {selectedNames.slice(0, MAX_SUMMARY_CHIPS).map((n) => (
            <View key={n} style={styles.summaryChip}>
              <Text style={styles.summaryChipText} numberOfLines={1}>
                {n}
              </Text>
            </View>
          ))}
          {selectedNames.length > MAX_SUMMARY_CHIPS ? (
            <Text style={styles.more}>+{selectedNames.length - MAX_SUMMARY_CHIPS}</Text>
          ) : null}
        </View>
      ) : null}

      {open ? (
        isLoading ? (
          <LoadingIndicator size="small" />
        ) : isError ? (
          <Text style={styles.summary}>Couldn't load {noun}. Close and reopen to retry.</Text>
        ) : options.length === 0 ? (
          <Text style={styles.summary}>
            {kind === "client" ? "No clients yet." : "No warehouses yet. Add them under a client first."}
          </Text>
        ) : (
          <View style={styles.body}>
            {options.length > 6 ? (
              <View style={styles.search}>
                <Search size={13} color="#A3A3A3" strokeWidth={2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={kind === "client" ? "Search client" : "Search warehouse, city or client"}
                  placeholderTextColor="#A3A3A3"
                  style={styles.searchInput}
                  autoCorrect={false}
                />
              </View>
            ) : null}
            <ScrollView style={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {groups.length === 0 ? (
                <Text style={styles.summary}>No match.</Text>
              ) : (
                groups.map(([client, items]) => {
                  const onCount = items.filter((w) => selected.has(w.id)).length;
                  const all = onCount === items.length;
                  return (
                    <View key={client} style={styles.group}>
                      <Pressable
                        onPress={() => items.forEach((w) => onToggle(w.id, !all))}
                        disabled={!editable}
                        style={styles.groupHead}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: all ? true : onCount > 0 ? "mixed" : false }}
                        accessibilityLabel={`All ${client} ${noun}`}
                      >
                        <View style={[styles.box, onCount > 0 && styles.boxOn]}>
                          {all ? (
                            <Check size={10} color="#FFFFFF" strokeWidth={3} />
                          ) : onCount > 0 ? (
                            <Minus size={10} color="#FFFFFF" strokeWidth={3} />
                          ) : null}
                        </View>
                        <Text style={styles.groupTitle} numberOfLines={1}>
                          {client}
                        </Text>
                        <Text style={styles.groupCount}>
                          {onCount}/{items.length}
                        </Text>
                      </Pressable>
                      <View style={styles.chipRow}>
                        {items.map((w) => {
                          const on = selected.has(w.id);
                          return (
                            <Pressable
                              key={w.id}
                              onPress={() => onToggle(w.id, !on)}
                              disabled={!editable}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on, disabled: !editable }}
                              accessibilityLabel={w.city ? `${w.name}, ${w.city}` : w.name}
                              hitSlop={4}
                              style={({ pressed }) => [
                                styles.chip,
                                on && styles.chipOn,
                                pressed && editable && { opacity: 0.8 },
                              ]}
                            >
                              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                                {w.name}
                              </Text>
                              {w.city && w.city.toLowerCase() !== w.name.toLowerCase() ? (
                                <Text style={[styles.chipCity, on && styles.chipCityOn]} numberOfLines={1}>
                                  {w.city}
                                </Text>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FBFBFB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  headCopy: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 12, fontWeight: "600", color: "#171717", letterSpacing: -0.2 },
  summary: { fontSize: 12, color: "#737373", lineHeight: 16 },
  summaryWarn: { color: "#B45309" },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  summaryChip: {
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#171717",
  },
  summaryChipText: { fontSize: 11, fontWeight: "600", color: "#FFFFFF" },
  more: { fontSize: 11, fontWeight: "600", color: "#525252" },
  body: { gap: 8 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 12, color: "#171717", paddingVertical: 6 },
  scroll: { maxHeight: 260 },
  group: { gap: 6, paddingBottom: 10 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
  groupTitle: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "600", color: "#262626" },
  groupCount: { fontSize: 11, color: "#A3A3A3" },
  box: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#A3A3A3",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: "#171717", borderColor: "#171717" },
  chip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    maxWidth: "100%",
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4D4D4",
  },
  chipOn: { backgroundColor: "#171717", borderColor: "#171717" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#262626" },
  chipTextOn: { color: "#FFFFFF" },
  chipCity: { fontSize: 11, color: "#A3A3A3" },
  chipCityOn: { color: "rgba(255,255,255,0.6)" },
});
