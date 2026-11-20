import { Alert, Platform } from 'react-native';

/**
 * Ask why the driver declines a fleet invite (optional; the fleet sees it).
 * Resolves `undefined` when cancelled, `null` for "no reason".
 * Android shows at most 3 buttons, so native offers one common reason.
 */
export function askDeclineReason(): Promise<string | null | undefined> {
  const title = 'Decline invitation?';
  const msg = 'The fleet will see your reason (optional).';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const r = window.prompt(`${title}\n\n${msg}\n(e.g. Pay too low, route / timing)`, '');
    return Promise.resolve(r === null ? undefined : r.trim() || null);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      msg,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(undefined) },
        { text: 'Pay too low', onPress: () => resolve('Pay too low') },
        { text: 'Decline', style: 'destructive', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(undefined) },
    );
  });
}
