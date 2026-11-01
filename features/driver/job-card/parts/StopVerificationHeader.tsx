import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Layout from '@/constants/Layout';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';

type Colors = ReturnType<typeof getDriverThemeColors>;

type Props = {
  colors: Colors;
  role: 'Pickup' | 'Delivery';
  stopIndex: number;
  stopTotal: number;
  review?: boolean;
  onBack: () => void;
  onPrevious?: (() => void) | null;
  onNext?: (() => void) | null;
};

export function StopVerificationHeader({
  colors,
  role,
  stopIndex,
  stopTotal,
  review,
  onBack,
  onPrevious,
  onNext,
}: Props) {
  const showPager = onPrevious !== undefined || onNext !== undefined;
  return (
    <View>
    <View style={styles.wrap}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={Layout.touchTargetHitSlop}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
      </Pressable>
      <View style={styles.center}>
        <Text style={[styles.role, { color: colors.text }]}>{role}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {review ? 'Details' : 'Verify'} · Stop {stopIndex} of {stopTotal}
        </Text>
      </View>
      <View style={styles.side} />
    </View>
    {showPager ? (
      <View style={styles.pager}>
        <Pressable
          onPress={onPrevious ?? undefined}
          disabled={!onPrevious}
          accessibilityRole="button"
          accessibilityLabel="Previous stop"
          accessibilityState={{ disabled: !onPrevious }}
          hitSlop={Layout.touchTargetHitSlop}
          style={({ pressed }) => [
            styles.pagerBtn,
            { opacity: !onPrevious ? 0.35 : pressed ? 0.7 : 1 },
          ]}
        >
          <ChevronLeft size={16} color={colors.emerald} strokeWidth={2.4} />
          <Text style={[styles.pagerText, { color: colors.emerald }]}>Previous</Text>
        </Pressable>
        <Pressable
          onPress={onNext ?? undefined}
          disabled={!onNext}
          accessibilityRole="button"
          accessibilityLabel="Next stop"
          accessibilityState={{ disabled: !onNext }}
          hitSlop={Layout.touchTargetHitSlop}
          style={({ pressed }) => [
            styles.pagerBtn,
            styles.pagerBtnEnd,
            { opacity: !onNext ? 0.35 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.pagerText, { color: colors.emerald }]}>Next</Text>
          <ChevronRight size={16} color={colors.emerald} strokeWidth={2.4} />
        </Pressable>
      </View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 8,
    minHeight: 52,
    gap: 12,
  },
  back: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: Layout.minTouchTargetSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: {
    width: Layout.minTouchTargetSize,
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  role: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 6,
  },
  pagerBtn: {
    minHeight: Layout.minTouchTargetSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  pagerBtnEnd: {
    justifyContent: 'flex-end',
  },
  pagerText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
