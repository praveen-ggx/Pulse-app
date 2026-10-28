import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import Theme from "@/constants/Theme";
import { useIndentHubActivity } from "@/features/trips/hooks/useIndentHubActivity";
import {
  indentHubActivityPageSize,
  indentMatchesHubActivitySearch,
  nextIndentActivitySelection,
} from "@/features/trips/utils/indentHubActivity.util";
import { formatLedgerDateTime } from "@/lib/format";
import { History, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DRAWER_WIDTH = 420;

export function IndentHubActivityLogButton({
  onPress,
  compact = false,
  selected = false,
}: {
  onPress: () => void;
  compact?: boolean;
  selected?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.toolbarBtn,
        compact && styles.cardBtn,
        selected && styles.toolbarBtnSelected,
      ]}
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress();
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        selected ? "Unselect indent activity log" : "Open indent activity log"
      }
      hitSlop={8}
    >
      <History
        size={compact ? 11 : 13}
        color={selected ? Theme.primary : Theme.textSecondary}
        strokeWidth={2.2}
      />
    </TouchableOpacity>
  );
}

export function IndentHubActivityLogPanel({
  visible,
  orgId,
  indentId = null,
  onClose,
  onSelectIndent,
}: {
  visible: boolean;
  orgId: string | null;
  indentId?: string | null;
  onClose: () => void;
  onSelectIndent?: (indentId: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pageSize = useMemo(() => indentHubActivityPageSize(height), [height]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(indentId);
  const lastClickAt = useRef(0);
  const compact = width < 768;

  useEffect(() => {
    if (!visible) return;
    setSelectedId(indentId ?? null);
  }, [visible, indentId]);

  useEffect(() => {
    if (!visible) return;
    setSearchInput("");
    setSearch("");
    lastClickAt.current = 0;
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput, visible]);

  const { rows, namesById, loading, loadingMore, hasMore, error, loadMore } =
    useIndentHubActivity(orgId, {
      enabled: visible && Boolean(orgId),
      pageSize,
      search: selectedId ? "" : search,
      indentId: selectedId,
    });
  const visibleRows = useMemo(
    () => rows.filter((row) => indentMatchesHubActivitySearch(row, search)),
    [rows, search],
  );
  const selectedRef = visibleRows[0]?.indentRef ?? null;

  const selectIndent = (nextId: string) => {
    const result = nextIndentActivitySelection(
      selectedId,
      nextId,
      Date.now(),
      lastClickAt.current,
    );
    lastClickAt.current = result.lastClickAt;
    setSelectedId(result.selectedId);
    onSelectIndent?.(result.selectedId);
  };

  if (!orgId) return null;

  const body = (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Activity</Text>
          <Text style={styles.subtitle}>
            {selectedId
              ? `All changes for ${selectedRef || "this indent"}`
              : "Who created or changed an indent"}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close activity log"
          style={styles.closeBtn}
        >
          <X size={16} color={Theme.textSecondary} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={styles.searchWrap}>
        <Search size={14} color={Theme.textMuted} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search indent, client, or trip id"
          placeholderTextColor={Theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel="Search activity log"
        />
        {searchInput ? (
          <Pressable
            onPress={() => {
              setSearchInput("");
              setSearch("");
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear activity search"
          >
            <X size={13} color={Theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {selectedId ? (
        <Pressable
          onPress={() => {
            setSelectedId(null);
            onSelectIndent?.(null);
            lastClickAt.current = 0;
          }}
          style={styles.selectedChip}
          accessibilityRole="button"
          accessibilityLabel="Clear selected indent. Double-click a row to unselect."
        >
          <Text style={styles.selectedChipText} numberOfLines={1}>
            Selected {selectedRef || "indent"}
          </Text>
          <X size={12} color={Theme.primary} />
        </Pressable>
      ) : null}
      {loading && visibleRows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Theme.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={(item) => item.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            visibleRows.length === 0 ? styles.emptyContent : styles.listContent
          }
          onEndReached={() => {
            if (!selectedId && hasMore && !loadingMore) void loadMore();
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? "No activity matches that search." : "No indent activity yet."}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={Theme.primary} />
              </View>
            ) : selectedId ? (
              <Text style={styles.moreHint}>Double-click to unselect this indent</Text>
            ) : hasMore ? (
              <Text style={styles.moreHint}>Scroll for older activity</Text>
            ) : visibleRows.length > 0 ? (
              <Text style={styles.moreHint}>End of activity</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const actor =
              (item.createdByUserId && namesById[item.createdByUserId]) || "Staff";
            const active = selectedId === item.indentId;
            return (
              <Pressable
                onPress={() => selectIndent(item.indentId)}
                style={[styles.row, active && styles.rowSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.indentRef}, ${item.action}. Click to select, double-click to unselect.`}
              >
                <View style={[styles.dot, item.kind === "failed" && styles.dotFailed]} />
                <View style={styles.rowBody}>
                  <Text style={styles.indentRef} numberOfLines={1}>
                    {item.indentRef}
                    {item.clientName ? ` · ${item.clientName}` : ""}
                  </Text>
                  {item.tripRef && item.kind === "trip" ? (
                    <Text style={styles.tripRef} numberOfLines={1}>
                      Trip {item.tripRef}
                    </Text>
                  ) : item.route ? (
                    <Text style={styles.route} numberOfLines={1}>
                      {item.route}
                    </Text>
                  ) : null}
                  <Text style={styles.actor} numberOfLines={2}>
                    {actor} {item.action}
                  </Text>
                  <Text style={styles.stamp}>{formatLedgerDateTime(item.at)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );

  if (Platform.OS === "web") {
    return (
      <RegistryWebDrawer visible={visible} onClose={onClose} width={DRAWER_WIDTH}>
        {body}
      </RegistryWebDrawer>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={compact ? "fullScreen" : "pageSheet"}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.nativeSheet,
          { paddingTop: insets.top, paddingBottom: insets.bottom, maxHeight: height },
        ]}
      >
        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toolbarBtn: {
    width: 30,
    height: 30,
    minWidth: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarBtnSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  cardBtn: {
    width: 22,
    height: 22,
    minWidth: 22,
    borderRadius: 11,
  },
  panel: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
  },
  nativeSheet: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 10,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimary,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  selectedChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingVertical: 8 },
  emptyContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  error: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: Theme.negative,
  },
  footer: { paddingVertical: 16, alignItems: "center" },
  moreHint: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    paddingVertical: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  rowSelected: {
    backgroundColor: Theme.tableRowHover,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: Theme.primary,
  },
  dotFailed: {
    backgroundColor: Theme.negative,
  },
  rowBody: { flex: 1, minWidth: 0 },
  indentRef: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  tripRef: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  route: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  actor: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  stamp: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
});
