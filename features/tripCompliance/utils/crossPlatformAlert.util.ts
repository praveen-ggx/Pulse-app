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

export type SlotUploadChoice = "replace" | "add_page";

/**
 * A vehicle / driver slot already has a file. Ask whether the new file
 * replaces it (a renewed document — the old copy is kept as history) or is
 * another page of the same document. Null = cancelled.
 * Web has no three-button dialog, so it asks two yes/no questions.
 */
export async function chooseReplaceOrAddPage(label: string): Promise<SlotUploadChoice | null> {
  const title = `${label} is already on file`;
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\nReplace it with the new file? The current file is kept as history.\n\nOK = Replace · Cancel = more options`)) {
      return "replace";
    }
    return window.confirm(`Add the new file as another page of the current ${label}?\n\nOK = Add page · Cancel = stop`)
      ? "add_page"
      : null;
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      "Replace it with a renewed document, or add another page of the same document?",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        { text: "Add page", onPress: () => resolve("add_page") },
        { text: "Replace", onPress: () => resolve("replace") },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
