import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";

export type CapturedImage = {
  uri: string;
};

type CaptureAttempt = CapturedImage | null | "permission_denied" | "camera_unavailable";

export type CaptureImageOptions = {
  permissionTitle?: string;
  permissionMessage?: string;
  quality?: number;
  /** When true (default), offer camera first on native. Web always uses file picker. */
  preferCamera?: boolean;
  /**
   * "camera" on web opens the phone camera directly (file input with capture),
   * which also works on plain http where live camera access is blocked.
   * Native keeps its camera / library chooser.
   */
  source?: "camera" | "library";
};

async function launchWebCamera(quality: number): Promise<CapturedImage | null> {
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return { uri: result.assets[0].uri };
  } catch {
    return launchLibrary(quality);
  }
}

function isPermissionGranted(
  response: ImagePicker.CameraPermissionResponse | ImagePicker.MediaLibraryPermissionResponse,
): boolean {
  return response.granted === true || response.status === "granted";
}

function promptOpenSettings(title: string, message: string): void {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Open Settings", onPress: () => void Linking.openSettings() },
  ]);
}

async function ensureCameraPermission(options: CaptureImageOptions): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (isPermissionGranted(perm)) return true;

  const title = options.permissionTitle ?? "Camera required";
  const message =
    options.permissionMessage ??
    "Enable camera access to take a photo, or choose one from your photo library.";

  if (perm.canAskAgain === false) {
    promptOpenSettings(title, `${message} Open Settings to allow camera access.`);
  } else {
    Alert.alert(title, message);
  }
  return false;
}

async function ensureMediaLibraryPermission(options: CaptureImageOptions): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (isPermissionGranted(perm)) return true;

  const title = options.permissionTitle ?? "Photos required";
  const message =
    options.permissionMessage ?? "Allow photo library access to attach an image.";

  if (perm.canAskAgain === false) {
    promptOpenSettings(title, `${message} Open Settings to allow photo access.`);
  } else {
    Alert.alert(title, message);
  }
  return false;
}

async function launchCamera(quality: number): Promise<CaptureAttempt> {
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return { uri: result.assets[0].uri };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/simulator|unavailable|MissingCamera|CameraUnavailable/i.test(message)) {
      return "camera_unavailable";
    }
    throw error;
  }
}

async function launchLibrary(quality: number): Promise<CapturedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return { uri: result.assets[0].uri };
}

async function captureFromCamera(options: CaptureImageOptions): Promise<CaptureAttempt> {
  const quality = options.quality ?? 0.8;
  const cameraOk = await ensureCameraPermission(options);
  if (!cameraOk) return "permission_denied";
  return launchCamera(quality);
}

async function pickFromLibrary(options: CaptureImageOptions): Promise<CapturedImage | null> {
  const quality = options.quality ?? 0.8;
  const libraryOk = await ensureMediaLibraryPermission(options);
  if (!libraryOk) return null;
  return launchLibrary(quality);
}

/**
 * Capture or pick a single image. On native, shows camera vs library choice.
 * On web, opens the file picker (camera capture is unreliable in browsers).
 */
export function captureOrPickImage(options: CaptureImageOptions = {}): Promise<CapturedImage | null> {
  const quality = options.quality ?? 0.8;
  const preferCamera = options.preferCamera !== false;

  if (Platform.OS === "web") {
    return options.source === "camera" ? launchWebCamera(quality) : launchLibrary(quality);
  }

  if (!preferCamera) {
    return pickFromLibrary(options);
  }

  return new Promise((resolve) => {
    Alert.alert("Add photo", "Choose a source", [
      {
        text: "Take photo",
        onPress: () => {
          void (async () => {
            const captured = await captureFromCamera(options);
            if (captured && captured !== "permission_denied" && captured !== "camera_unavailable") {
              resolve(captured);
              return;
            }
            if (captured === "camera_unavailable") {
              const fromLibrary = await pickFromLibrary(options);
              resolve(fromLibrary);
              return;
            }
            resolve(null);
          })();
        },
      },
      {
        text: "Choose from library",
        onPress: () => {
          void pickFromLibrary(options).then(resolve);
        },
      },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}
