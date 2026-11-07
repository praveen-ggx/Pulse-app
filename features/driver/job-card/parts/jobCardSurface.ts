import { Platform, type ViewStyle } from 'react-native';
import Theme from '@/constants/Theme';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';

type Colors = ReturnType<typeof getDriverThemeColors>;

/** Card radius for Commerce job-card surfaces. */
export const JOB_CARD_RADIUS = 16;

/** Soft lift used instead of hairline borders on Commerce job-card cards. */
export const softElevation: ViewStyle = Platform.select<ViewStyle>({
  web: { boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.04)' } as ViewStyle,
  default: {
    shadowColor: Theme.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
}) as ViewStyle;

/** Card fill that lifts off the sheet surface in both driver themes. */
export function cardBackground(colors: Colors): string {
  return colors.background === Theme.driverBackground ? colors.surfaceElevated : colors.background;
}

export type StatusTone = 'done' | 'active' | 'next' | 'pending' | 'failed';

/** Pill colours per stop/order status. Driver palette only. */
export function statusToneColors(colors: Colors, tone: StatusTone): { bg: string; fg: string } {
  switch (tone) {
    case 'done':
      return { bg: colors.emeraldMuted, fg: colors.emerald };
    case 'active':
      return { bg: Theme.accentGoldMuted, fg: Theme.warning };
    case 'next':
      return { bg: colors.emeraldMuted, fg: colors.emerald };
    case 'failed':
      return { bg: colors.negativeMuted, fg: Theme.negative };
    default:
      return { bg: colors.surfaceElevated, fg: colors.textMuted };
  }
}
