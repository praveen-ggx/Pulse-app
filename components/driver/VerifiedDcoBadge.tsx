/**
 * "Verified DCO" pill — shown only for an APPROVED DCO. Approval itself
 * requires identity KYC + PAN + bank proof verified (platform_approve_dco),
 * so APPROVED already means fully verified. Pure UI: callers pass the state.
 *
 * tone="onDark" is for dark hero surfaces (profile header card); "auto"
 * follows the driver theme (light / dark).
 */
import Theme from '@/constants/Theme';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { ShieldCheck } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  size?: 'sm' | 'md';
  tone?: 'auto' | 'onDark';
  style?: StyleProp<ViewStyle>;
};

export function VerifiedDcoBadge({ size = 'md', tone = 'auto', style }: Props) {
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const onDark = tone === 'onDark' || isDark;

  const fg = onDark ? Theme.driverPrimary : colors.emerald;
  const bg = onDark ? Theme.driverEmeraldMuted : Theme.positiveMuted;
  const border = onDark ? Theme.driverEmeraldBorder : Theme.driverEmeraldBorderSoft;
  const sm = size === 'sm';

  return (
    <View
      style={[
        styles.pill,
        sm ? styles.pillSm : null,
        { backgroundColor: bg, borderColor: border },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel="Verified DCO"
    >
      <ShieldCheck size={sm ? 12 : 14} color={fg} strokeWidth={2.6} />
      <Text style={[styles.label, sm ? styles.labelSm : null, { color: fg }]}>Verified DCO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  labelSm: { fontSize: 10.5, letterSpacing: 0.3 },
});
