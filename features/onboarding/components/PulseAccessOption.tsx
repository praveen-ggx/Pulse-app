import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { WEB_TOP_NAV_ICON } from '@/components/demo/webTopNavIcon.tokens';
import Theme from '@/constants/Theme';
import type { WorkspaceAccessAction } from '@/lib/onboarding/productCatalog';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';

export interface PulseAccessOptionProps {
  action: WorkspaceAccessAction;
  onPress: () => void;
  compact?: boolean;
}

export const PulseAccessOption = memo(function PulseAccessOption({
  action,
  onPress,
  compact = false,
}: PulseAccessOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        compact && styles.rowCompact,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
        {action.title}
      </Text>
      <View style={styles.chevronSlot}>
        <ChevronRight
          size={12}
          color={Theme.textSecondary}
          strokeWidth={WEB_TOP_NAV_ICON.stroke}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    ...Platform.select({
      web: {
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      } as object,
      default: {},
    }),
  },
  rowPressed: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlue,
  },
  rowCompact: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: ONBOARDING_BRAND.ink,
  },
  titleCompact: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '400',
  },
  chevronSlot: {
    width: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
});
