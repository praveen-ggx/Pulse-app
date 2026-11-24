import type { TextStyle } from 'react-native';

/**
 * Driver app text uses the platform system font, same as the core Pulse app
 * (SF Pro on iOS, Roboto on Android, system UI on web). Emphasis comes from
 * weight only; screen styles merged after these keep their own size/tracking.
 */

/** Wallet trip row secondary line (route / meta). */
export const driverBodySecondary: TextStyle = {
  fontWeight: '400',
};

/** Primary title line on compact rows. */
export const driverBodyPrimary: TextStyle = {
  fontWeight: '500',
};

export const driverUISemiBold: TextStyle = {
  fontWeight: '600',
};

export const driverUIBold: TextStyle = {
  fontWeight: '700',
};

export const driverUIExtraBold: TextStyle = {
  fontWeight: '800',
};

/** Tab bar micro labels — keeps Typography sizing; adds weight only. */
export const driverTabMicroLabel: TextStyle = {
  fontWeight: '700',
};
