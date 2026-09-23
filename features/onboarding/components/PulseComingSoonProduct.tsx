import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';

import Theme from '@/constants/Theme';
import type { PulseProductPreview } from '@/lib/onboarding/productCatalog';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';

export interface PulseComingSoonProductProps {
  product: PulseProductPreview;
  /** Horizontal chip in the bottom scroll strip. */
  variant?: 'list' | 'chip';
}

export const PulseComingSoonProduct = memo(function PulseComingSoonProduct({
  product,
  variant = 'chip',
}: PulseComingSoonProductProps) {
  if (variant === 'chip') {
    return (
      <View
        style={styles.chip}
        accessibilityLabel={`${product.name}, locked`}
      >
        <Lock size={10} color={Theme.textMuted} strokeWidth={2.2} />
        <Text style={styles.chipName}>{product.name}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.name}>{product.name}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 54, 54, 0.1)',
    backgroundColor: Theme.analyticsCanvas,
    opacity: 0.55,
  },
  chipName: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: ONBOARDING_BRAND.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    opacity: 0.42,
  },
  name: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: ONBOARDING_BRAND.ink,
  },
});
