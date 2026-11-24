/**
 * Tracking subsystem feature flags (env-driven, no Zustand).
 */
export function isTrackingBroadcastV1Enabled(): boolean {
  if (typeof process === 'undefined') return false;
  return String(process.env.EXPO_PUBLIC_TRACKING_BROADCAST_V1 ?? '').trim() === '1';
}

/**
 * Driver live tracking lane (foreground + background GPS → broadcast + sparse checkpoints).
 * Default ON. Kill switch: EXPO_PUBLIC_DRIVER_LIVE_TRACKING=0 (rebuild required).
 * Independent of EXPO_PUBLIC_TRACKING_BROADCAST_V1, which also disables the legacy
 * driver_locations realtime path on the dispatcher — this flag does not.
 */
export function isDriverLiveTrackingEnabled(): boolean {
  if (typeof process === 'undefined') return true;
  return String(process.env.EXPO_PUBLIC_DRIVER_LIVE_TRACKING ?? '').trim() !== '0';
}
