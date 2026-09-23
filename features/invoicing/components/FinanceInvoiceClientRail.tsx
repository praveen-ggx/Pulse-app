import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import type { FinanceClientRailRow } from "@/features/invoicing/utils/financeClientRail.util";
import { financeInvoiceWorkspaceStyles as s } from "@/features/invoicing/components/financeInvoiceWorkspace.styles";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export function FinanceInvoiceClientRail({
  rows,
  activeKey,
  search,
  onSearch,
  onSelect,
}: {
  rows: FinanceClientRailRow[];
  activeKey: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={s.rail} accessibilityLabel="Clients">
      <View style={s.railHead}>
        <Text style={s.railTitle}>Clients</Text>
      </View>
      <View style={s.railSearch}>
        <FontAwesome
          name="search"
          size={11}
          color={Theme.textMuted}
          style={{ marginRight: 6 }}
        />
        <TextInput
          style={s.railSearchInput}
          placeholder="Search clients..."
          placeholderTextColor={Theme.textMuted}
          value={search}
          onChangeText={onSearch}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          const active = activeKey === item.key;
          const initial = (item.name.trim()[0] || "?").toUpperCase();
          return (
            <Pressable
              style={[s.railRow, active && s.railRowActive]}
              onPress={() => onSelect(item.key)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ selected: active }}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.railName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={s.railMeta} numberOfLines={1}>
                  {item.picture.eligibleTripCount} eligible ·{" "}
                  {item.picture.listedTripCount} trips
                </Text>
              </View>
              <Text style={s.railValue}>
                {formatInr(item.issuedInvoiceValue)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
