/**
 * `Alert.alert` is a documented no-op on web — react-native-web's
 * implementation (`node_modules/react-native-web/.../exports/Alert`) is a
 * literal empty `static alert() {}`. This app is actively deployed to and
 * tested on web (gogopulse.com via Netlify), so any Compliance confirm/error
 * dialog built on `Alert.alert` alone would silently do nothing there —
 * found live via browser acceptance testing on this exact feature. These
 * two helpers fall back to real browser dialogs on web and use `Alert` on
 * native, where it does work.
 */
import { Alert, Platform } from "react-native";

export function alertMessage(title: string, message: string): void {
  if (Platform.OS === "web") {
     
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export async function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === "web") {
     
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}
