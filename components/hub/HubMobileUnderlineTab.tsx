import { memo } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";

import { HUB_MOBILE_ACCENT, hubMobileChromeStyles as styles } from "./hubMobileChrome";

type HoverPressState = { pressed: boolean; hovered?: boolean };

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

export interface HubMobileUnderlineTabProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Metric / secondary row — smaller type and tighter padding. */
  compact?: boolean;
  /** Override active tab accent (e.g. load center yellow tabs). */
  accentColor?: string;
}

export const HubMobileUnderlineTab = memo(function HubMobileUnderlineTab({
  label,
  isActive,
  onPress,
  accessibilityLabel,
  compact = false,
  accentColor = HUB_MOBILE_ACCENT,
}: HubMobileUnderlineTabProps) {
  const activeColor = accentColor || HUB_MOBILE_ACCENT;

  return (
    <Pressable
      style={(state: HoverPressState) => [
        styles.tabItem,
        compact && styles.tabItemCompact,
        WEB_POINTER,
        !isActive && (state.hovered || state.pressed) ? { opacity: 0.72 } : null,
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.tabLabel,
          compact && styles.tabLabelCompact,
          isActive && styles.tabLabelActive,
          isActive && { color: activeColor },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isActive ? (
        <View
          style={[
            styles.tabUnderline,
            compact && styles.tabUnderlineCompact,
            { backgroundColor: activeColor },
          ]}
        />
      ) : null}
    </Pressable>
  );
});
