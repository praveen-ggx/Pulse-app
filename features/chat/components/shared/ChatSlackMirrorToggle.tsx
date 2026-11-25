import { PULSE_CHAT } from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { CHAT_ACCENT, CHAT_ICON_MUTED } from "@/features/chat/chatTheme";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { ListFilter } from "lucide-react-native";
import { useMirrorIndicator } from "@/lib/hooks/useMirrorIndicator";
import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type MirrorToggleItem = {
  id: string;
  label: string;
  subLabel?: string;
  avatarIdentity?: ResolvedPartyAvatarIdentity;
  Icon?: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  badge?: number;
  showFilterIcon?: boolean;
  disabled?: boolean;
};

type MirrorVariant = "bottomNav" | "sidebar" | "filter" | "party";

function partySecondLine(label?: string, subLabel?: string): string | null {
  const second = (subLabel ?? "").trim();
  if (!second) return null;
  const first = (label ?? "").trim();
  if (first && first.localeCompare(second, undefined, { sensitivity: "accent" }) === 0) {
    return null;
  }
  return second;
}

export function ChatSlackMirrorToggle({
  items,
  activeId,
  onSelect,
  variant,
  style,
}: {
  items: MirrorToggleItem[];
  activeId: string;
  onSelect: (id: string) => void;
  variant: MirrorVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const axis = variant === "sidebar" ? "y" : "x";
  const { translate, indicatorSize, onItemLayout } = useMirrorIndicator(activeId, axis);
  const partyGlow = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (variant !== "party") return;
    partyGlow.stopAnimation();
    partyGlow.setValue(0.3);
    Animated.sequence([
      Animated.timing(partyGlow, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(partyGlow, {
        toValue: 0.55,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeId, variant, partyGlow]);

  const indicatorInset = variant === "party" ? 4 : 3;
  const indicatorStyle =
    axis === "x"
      ? {
          transform: [{ translateX: translate }],
          width: indicatorSize > 0 ? indicatorSize : 0,
          top: indicatorInset,
          bottom: indicatorInset,
          opacity: indicatorSize > 0 ? 1 : 0,
        }
      : {
          transform: [{ translateY: translate }],
          height: indicatorSize > 0 ? indicatorSize : 0,
          left: indicatorInset,
          right: indicatorInset,
          opacity: indicatorSize > 0 ? 1 : 0,
        };

  const trackStyle =
    variant === "bottomNav"
      ? styles.bottomTrack
      : variant === "sidebar"
        ? styles.sidebarTrack
        : variant === "party"
          ? styles.partyTrack
          : styles.filterTrack;

  const indicatorVariantStyle =
    variant === "bottomNav"
      ? styles.bottomIndicator
      : variant === "sidebar"
        ? styles.sidebarIndicator
        : variant === "party"
          ? styles.partyIndicator
          : styles.filterIndicator;
  const twoPartyMode = variant === "party" && items.length === 2;
  const multiPartyMode = variant === "party" && items.length >= 3;

  return (
    <View
      style={[
        trackStyle,
        twoPartyMode && styles.partyTrackTwoItem,
        multiPartyMode && styles.partyTrackMulti,
        style,
      ]}
    >
      <Animated.View style={[styles.indicatorBase, indicatorVariantStyle, indicatorStyle]}>
        {variant === "party" ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.partyGlow,
              {
                opacity: partyGlow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.1, 0.24],
                }),
              },
            ]}
          />
        ) : null}
      </Animated.View>
      {items.map((item) => {
        const active = activeId === item.id;
        const iconColor = active
          ? variant === "sidebar"
            ? "#1D1C1D"
            : PULSE_CHAT.accent
          : variant === "sidebar"
            ? "rgba(226,232,240,0.82)"
            : "#616061";
        const stroke = active ? 2.1 : 1.65;

        if (variant === "bottomNav") {
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.bottomItem}
              onPress={() => onSelect(item.id)}
              onLayout={(e) => onItemLayout(item.id, e)}
              activeOpacity={0.82}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.bottomIconWrap}>
                {item.Icon ? (
                  <item.Icon size={19} color={iconColor} strokeWidth={stroke} />
                ) : null}
                {(item.badge ?? 0) > 0 ? (
                  <View style={styles.bottomBadge}>
                    <Text style={styles.bottomBadgeText}>
                      {(item.badge ?? 0) > 9 ? "9+" : String(item.badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }

        if (variant === "sidebar") {
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.sidebarItem}
              onPress={() => onSelect(item.id)}
              onLayout={(e) => onItemLayout(item.id, e)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {item.Icon ? (
                <item.Icon size={14} color={iconColor} strokeWidth={stroke} />
              ) : null}
              <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              {(item.badge ?? 0) > 0 ? (
                <View style={styles.sidebarBadge}>
                  <Text style={styles.sidebarBadgeText}>
                    {(item.badge ?? 0) > 9 ? "9+" : String(item.badge)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }

        if (variant === "party") {
          const secondLine = partySecondLine(item.label, item.subLabel);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.partyItem,
                secondLine ? styles.partyItemStacked : styles.partyItemSingle,
                twoPartyMode && styles.partyItemTwoItem,
                multiPartyMode && styles.partyItemMulti,
                item.disabled && styles.partyItemOff,
              ]}
              onPress={() => !item.disabled && onSelect(item.id)}
              onLayout={(e) => onItemLayout(item.id, e)}
              activeOpacity={0.82}
              disabled={item.disabled}
            >
              {item.avatarIdentity ? (
                <View style={[styles.partyAvatarWrap, active && styles.partyAvatarWrapActive]}>
                  <ChatPartyAvatar identity={item.avatarIdentity} size={20} />
                </View>
              ) : item.Icon ? (
                <View style={[styles.partyAvatarWrap, active && styles.partyAvatarWrapActive]}>
                  <item.Icon
                    size={16}
                    color={active ? "#FFFFFF" : CHAT_ICON_MUTED}
                    strokeWidth={2.2}
                  />
                </View>
              ) : null}
              <View
                style={[
                  styles.partyTextCol,
                  secondLine ? styles.partyTextColStacked : styles.partyTextColSingle,
                ]}
              >
                {item.label ? (
                  <Text
                    style={[styles.partyName, active && styles.partyNameActive, { includeFontPadding: false }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.label}
                  </Text>
                ) : null}
                {secondLine ? (
                  <Text
                    style={[styles.partyRole, active && styles.partyRoleActive, { includeFontPadding: false }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {secondLine}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={item.id}
            style={styles.filterItem}
            onPress={() => onSelect(item.id)}
            onLayout={(e) => onItemLayout(item.id, e)}
            activeOpacity={0.82}
          >
            {item.showFilterIcon ? (
              <ListFilter
                size={13}
                color={active ? "#FFFFFF" : "#616061"}
                strokeWidth={active ? 2.1 : 1.65}
              />
            ) : null}
            <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  indicatorBase: {
    position: "absolute",
    left: 0,
    top: 0,
    borderRadius: 14,
  },
  bottomTrack: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#F5F5F5",
    borderRadius: 26,
    padding: 4,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  bottomIndicator: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    gap: 2,
    zIndex: 1,
    minWidth: 0,
  },
  bottomIconWrap: {
    position: "relative",
    width: 38,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBadge: {
    position: "absolute",
    top: -3,
    right: 2,
    minWidth: 13,
    height: 13,
    borderRadius: 7,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PULSE_CHAT.accent,
  },
  bottomBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  bottomLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#616061",
    letterSpacing: 0.1,
  },
  bottomLabelActive: {
    color: PULSE_CHAT.accent,
    fontWeight: "700",
  },
  sidebarTrack: {
    marginHorizontal: 8,
    marginBottom: 4,
    padding: 3,
    borderRadius: 10,
    backgroundColor: "rgba(15, 23, 42, 0.66)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
    gap: 0,
    position: "relative",
  },
  sidebarIndicator: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 30,
    zIndex: 1,
  },
  sidebarLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(226,232,240,0.82)",
  },
  sidebarLabelActive: {
    fontWeight: "600",
    color: "#1D1C1D",
  },
  sidebarBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT,
  },
  sidebarBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filterTrack: {
    marginHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    padding: 3,
    borderRadius: 18,
    backgroundColor: "#F4F4F4",
    borderWidth: 1,
    borderColor: "#ECECEC",
    // Stretch within parent; avoid width:100% + horizontal margin overflow.
    alignSelf: "stretch",
  },
  filterIndicator: {
    backgroundColor: PULSE_CHAT.matteBlack,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  filterItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
    zIndex: 1,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#616061",
  },
  filterLabelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  partyTrack: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: 16,
    backgroundColor: "#F4F5F7",
    borderWidth: 1,
    borderColor: "#E3E6EC",
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  partyTrackTwoItem: {
    width: "auto",
    minWidth: 268,
    maxWidth: 340,
  },
  partyTrackMulti: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  partyIndicator: {
    backgroundColor: "#111A36",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.42)",
    shadowColor: "#111A36",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
    elevation: 3,
  },
  partyGlow: {
    backgroundColor: "rgba(124, 141, 255, 0.28)",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(124, 141, 255, 0.52)",
    shadowColor: "#7C8DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 4,
  },
  partyItem: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 118,
    minHeight: 40,
    gap: 6,
    zIndex: 2,
  },
  partyItemSingle: {
    alignItems: "center",
  },
  partyItemStacked: {
    alignItems: "flex-start",
  },
  partyItemTwoItem: {
    flex: 1,
    minWidth: 0,
    maxWidth: undefined,
    paddingHorizontal: 10,
  },
  partyItemMulti: {
    flex: 1,
    minWidth: 0,
    maxWidth: undefined,
    paddingHorizontal: 8,
  },
  partyItemOff: {
    opacity: 0.45,
  },
  partyAvatarWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.1)",
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  partyAvatarWrapActive: {
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  partyTextCol: {
    flex: 1,
    minWidth: 0,
  },
  partyTextColSingle: {
    gap: 0,
    justifyContent: "center",
  },
  partyTextColStacked: {
    gap: 2,
    justifyContent: "flex-start",
  },
  partyName: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: "#374151",
    letterSpacing: 0.05,
  },
  partyNameActive: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  partyRole: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  partyRoleActive: {
    color: "rgba(255, 255, 255, 0.78)",
    fontWeight: "600",
  },
});
