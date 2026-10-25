import { memo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import Theme from '@/constants/Theme';
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import { PulseMascotBanner } from '@/components/PulseMascotBanner';
import type { PulseProduct } from '@/lib/onboarding/productCatalog';

import { PULSE_PRODUCT_VISUALS, type PulseProductVisual } from './onboardingPersonaAssets';
import { OnboardingPersonaLottieIcon } from './OnboardingPersonaLottieIcon';

export interface PulseProductOptionProps {
  product: PulseProduct;
  onPress: () => void;
  compact?: boolean;
}

export const PulseProductOption = memo(function PulseProductOption({
  product,
  onPress,
  compact = false,
}: PulseProductOptionProps) {
  const visual = PULSE_PRODUCT_VISUALS[product.id] as PulseProductVisual;
  const artHeight = compact ? 52 : 80;
  const bannerHeight = compact ? 52 : 76;
  const svgAspect = visual.type === 'svg' ? visual.aspect ?? 1 : 1;
  const svgWidth = Math.round(artHeight * svgAspect);
  const imageAspect = visual.type === 'image' ? visual.aspect ?? 1 : 1;
  const imageWidth = Math.round(artHeight * imageAspect);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        compact && styles.cardCompact,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}. ${product.tagline}`}
    >
      <View style={[styles.stage, compact && styles.stageCompact]}>
        <View style={styles.stageGlow} />
        {visual.type === 'mascot' ? (
          <View style={styles.mascotSlot}>
            <PulseMascotBanner id={visual.id} maxHeight={bannerHeight} />
          </View>
        ) : visual.type === 'svg' ? (
          <visual.Art
            width={svgWidth}
            height={artHeight}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : visual.type === 'lottie' ? (
          <OnboardingPersonaLottieIcon asset={visual.asset} size={artHeight} />
        ) : (
          <Image
            source={visual.source}
            style={{ width: imageWidth, height: artHeight }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        )}
      </View>
      <View style={styles.meta}>
        <PulseBrandMark
          word={product.brandWord}
          size="sm"
          textStyle={compact ? styles.nameCompactBrand : styles.nameBrand}
          numberOfLines={1}
        />
        {product.tagline ? (
          <Text style={styles.tagline} numberOfLines={2}>
            {product.tagline}
          </Text>
        ) : null}
        <View style={styles.startChip}>
          <Text style={styles.startChipText}>Get started</Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    ...Platform.select({
      web: {
        transition: 'transform 0.18s ease, border-color 0.15s ease',
        cursor: 'pointer',
      } as object,
      default: {},
    }),
  },
  cardCompact: {
    borderRadius: 14,
  },
  cardPressed: {
    borderColor: Theme.brandBlueInk,
  },
  stage: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.brandBlueSoft,
    overflow: 'hidden',
    paddingHorizontal: 10,
  },
  stageCompact: {
    height: 68,
  },
  stageGlow: {
    position: 'absolute',
    bottom: -16,
    width: 108,
    height: 60,
    borderRadius: 54,
    backgroundColor: Theme.brandBlue,
    opacity: 0.55,
  },
  mascotSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
    gap: 4,
  },
  nameBrand: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  nameCompactBrand: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: Theme.textMuted,
    textAlign: 'center',
  },
  startChip: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.brandBlue,
  },
  startChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.brandBlueInk,
    letterSpacing: 0.2,
  },
});
