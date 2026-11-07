import { LoadingIndicator } from '@/components/LoadingIndicator';
import { softElevation } from '@/features/driver/job-card/parts/jobCardSurface';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';
import type { MultiOrderActionKind } from '@/features/driver/job-card/multiOrderStopCopy';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Colors = ReturnType<typeof getDriverThemeColors>;

type Props = {
  colors: Colors;
  model: {
    kind: MultiOrderActionKind | 'idle';
    stageLabel: string | null;
    hint: string | null;
    cta: string | null;
  };
  nextPlace: string | null;
  busy: boolean;
  mutating: 'arrive' | 'complete' | null;
  onArrive: () => void;
  onComplete: () => void;
};

export function StopActionButton({
  colors,
  model,
  nextPlace,
  busy,
  mutating,
  onArrive,
  onComplete,
}: Props) {
  if (model.kind === 'idle') {
    if (!model.stageLabel && !model.hint && !nextPlace) return null;
    return (
      <View style={styles.idle} testID="multi-order-action-idle">
        {model.stageLabel ? (
          <Text style={[styles.stage, { color: colors.emerald }]}>{model.stageLabel}</Text>
        ) : null}
        {model.hint ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>{model.hint}</Text>
        ) : null}
        {nextPlace ? (
          <Text style={[styles.next, { color: colors.textMuted }]}>Next → {nextPlace}</Text>
        ) : null}
      </View>
    );
  }

  const onPress = model.kind === 'arrive' ? onArrive : onComplete;
  const showSpinner = busy && mutating === model.kind;

  return (
    <View style={styles.wrap}>
      {model.stageLabel ? (
        <Text style={[styles.stage, { color: colors.emerald }]}>{model.stageLabel}</Text>
      ) : null}
      {model.hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{model.hint}</Text>
      ) : null}
      <Pressable
        testID={model.kind === 'arrive' ? 'multi-order-arrive' : 'multi-order-complete-stop'}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={model.cta ?? undefined}
        style={({ pressed }) => [
          styles.cta,
          softElevation,
          { backgroundColor: colors.emerald, opacity: busy ? 0.6 : pressed ? 0.88 : 1 },
        ]}
      >
        {showSpinner ? (
          <LoadingIndicator size="small" color={colors.textOnPrimary} />
        ) : (
          <Text style={[styles.ctaText, { color: colors.textOnPrimary }]}>{model.cta}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  idle: { gap: 2 },
  stage: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  next: {
    fontSize: 11,
    fontWeight: '600',
  },
  cta: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 4,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
