import { StyleSheet, Text, View } from 'react-native';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';
import { statusToneColors, type StatusTone } from '@/features/driver/job-card/parts/jobCardSurface';

type Colors = ReturnType<typeof getDriverThemeColors>;

export function StatusPill({ colors, tone, label }: { colors: Colors; tone: StatusTone; label: string }) {
  const { bg, fg } = statusToneColors(colors, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
